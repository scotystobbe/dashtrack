/*
 * DashTrack application logic
 *
 * Handles form input, calculation of durations, miles, gas costs and hourly rates,
 * persists shift data to IndexedDB, displays recorded shifts, allows deletion,
 * exports data to CSV, and calculates weekly and overall summaries. Breaks are
 * supported: users can add any number of break intervals which reduce the
 * working time for the shift. All computations are updated live on input.
 */

// DOM elements
const form = document.getElementById('shiftForm');
const dateInput = document.getElementById('date');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const netEarningsInput = document.getElementById('netEarnings');
const milesStartInput = document.getElementById('milesStart');
const milesEndInput = document.getElementById('milesEnd');
const gallonsUsedInput = document.getElementById('gallonsUsed');
const dollarsPerGalInput = document.getElementById('dollarsPerGal');
const shiftDurationEl = document.getElementById('shiftDuration');
const workingDurationEl = document.getElementById('workingDuration');
const milesDrivenEl = document.getElementById('milesDriven');
const gasCostEl = document.getElementById('gasCost');
const grossEarningsEl = document.getElementById('grossEarnings');
const hourlyRateEl = document.getElementById('hourlyRate');
const breaksContainer = document.getElementById('breaksContainer');
const addBreakBtn = document.getElementById('addBreakBtn');
const entriesContainer = document.getElementById('entriesContainer');
const weekSummaryEl = document.getElementById('weekSummary');
const overallSummaryEl = document.getElementById('overallSummary');
const avgHourlySummaryEl = document.getElementById('avgHourlySummary');
const exportCsvBtn = document.getElementById('exportCsvBtn');

// Constants
// Default MPG used to compute gallons (26 miles per gallon)
const MPG = 26;
// Default gas price for ZIP 84062 derived from AAA Provo‑Orem metro average【710179261405807†L146-L152】.
const DEFAULT_GAS_PRICE = 3.272;

// State
let entries = [];
let db = null;

// IndexedDB setup
const DB_NAME = 'DashTrackDB';
const DB_VERSION = 1;
const STORE_NAME = 'shifts';

/**
 * Initialize IndexedDB
 */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      // Update storage status if admin menu is initialized
      if (typeof updateStorageStatus === 'function') {
        updateStorageStatus();
      }
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
      }
    };
  });
}

/**
 * Save entries to IndexedDB
 */
async function saveEntries() {
  try {
    if (!db) return;
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Clear existing data
    await store.clear();
    
    // Add all entries
    for (const entry of entries) {
      await store.add(entry);
    }
    
    // Also save to localStorage as backup
    try {
      localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
    } catch (localStorageErr) {
      console.warn('Failed to save to localStorage backup:', localStorageErr);
    }
    
  } catch (err) {
    console.error('Failed to save to IndexedDB, falling back to localStorage:', err);
    // Fallback to localStorage
    try {
      localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
    } catch (localStorageErr) {
      console.error('Failed to save to localStorage fallback:', localStorageErr);
      throw new Error('All storage methods failed');
    }
  }
}

/**
 * Load entries from IndexedDB
 */
async function loadEntriesFromDB() {
  if (!db) return [];
  
  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.getAll();
  
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Utility: parse a time string ("HH:MM") into minutes.
 * If the end time is smaller than the start time (i.e., crosses midnight),
 * add 24 hours. Both times are strings of format "HH:MM".
 * @param {string} start - start time HH:MM
 * @param {string} end - end time HH:MM
 * @returns {number} duration in minutes
 */
function calculateTimeDifferenceMinutes(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  // if crossing midnight, add 24h to end
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }
  return endMinutes - startMinutes;
}

/**
 * Format minutes into HH:MM string.
 * @param {number} minutes 
 * @returns {string}
 */
function formatMinutes(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Get total break minutes from current break inputs.
 * Each break is an object with startTime and endTime properties.
 * @returns {number}
 */
function getTotalBreakMinutes() {
  let total = 0;
  const breakEntries = breaksContainer.querySelectorAll('.break-entry');
  breakEntries.forEach(entry => {
    const startInput = entry.querySelector('.break-start');
    const endInput = entry.querySelector('.break-end');
    const start = startInput.value;
    const end = endInput.value;
    if (start && end) {
      total += calculateTimeDifferenceMinutes(start, end);
    }
  });
  return total;
}

/**
 * Format a number with comma separators for thousands. Returns a string.
 * @param {number|string} value
 */
function formatWithCommas(value) {
  if (value === '' || value === null || value === undefined) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  return num.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/**
 * Parse a comma‑separated numeric string into a float. Returns NaN on failure.
 * @param {string} str
 */
function parseCommaNumber(str) {
  if (!str) return NaN;
  return parseFloat(str.toString().replace(/,/g, ''));
}

/**
 * Recalculate all derived fields based on current inputs.
 */
function recalculate() {
  // Compute total shift and break durations
  const shiftMinutes = calculateTimeDifferenceMinutes(startTimeInput.value, endTimeInput.value);
  const breakMinutes = getTotalBreakMinutes();
  const workingMinutes = Math.max(shiftMinutes - breakMinutes, 0);
  if (shiftMinutes > 0) {
    shiftDurationEl.value = formatMinutes(shiftMinutes);
  } else {
    shiftDurationEl.value = '';
  }
  if (workingMinutes > 0) {
    workingDurationEl.value = formatMinutes(workingMinutes);
  } else {
    workingDurationEl.value = '';
  }
  // Miles driven
  const milesStart = parseCommaNumber(milesStartInput.value);
  const milesEnd = parseCommaNumber(milesEndInput.value);
  let miles = NaN;
  if (!isNaN(milesStart) && !isNaN(milesEnd)) {
    miles = milesEnd - milesStart;
    milesDrivenEl.value = miles.toFixed(2);
  } else {
    milesDrivenEl.value = '';
  }
  // Gallons used: automatically computed from miles driven and a fixed MPG (26 mpg)
  let gallons = NaN;
  if (!isNaN(miles)) {
    gallons = miles / 26;
    gallonsUsedInput.value = gallons.toFixed(2);
  } else {
    gallonsUsedInput.value = '';
  }
  // Gas cost
  const pricePerGal = parseFloat(dollarsPerGalInput.value);
  let gasCost = 0;
  if (!isNaN(gallons) && !isNaN(pricePerGal)) {
    gasCost = gallons * pricePerGal;
    gasCostEl.value = gasCost.toFixed(2);
  } else {
    gasCostEl.value = '';
  }
  // Gross pay from input
  const grossPay = parseFloat(netEarningsInput.value);
  if (!isNaN(grossPay)) {
    // Net profit = gross pay minus gas cost
    const netProfit = grossPay - (gasCost || 0);
    grossEarningsEl.value = netProfit.toFixed(2);
  } else {
    grossEarningsEl.value = '';
  }
  // Hourly earnings based on net profit
  if (!isNaN(grossPay) && workingMinutes > 0) {
    const netProfit = grossPay - (gasCost || 0);
    const hours = workingMinutes / 60;
    const hourly = netProfit / hours;
    hourlyRateEl.value = hourly.toFixed(2);
  } else {
    hourlyRateEl.value = '';
  }
}

/**
 * Add a new break row to the breaks container.
 */
function addBreakRow(startValue = '', endValue = '') {
  const div = document.createElement('div');
  div.classList.add('break-entry');
  const startInput = document.createElement('input');
  startInput.type = 'time';
  startInput.classList.add('break-start');
  startInput.value = startValue;
  const endInput = document.createElement('input');
  endInput.type = 'time';
  endInput.classList.add('break-end');
  endInput.value = endValue;
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.classList.add('remove-break');
  removeBtn.innerHTML = '&times;';
  removeBtn.title = 'Remove break';
  removeBtn.addEventListener('click', () => {
    div.remove();
    recalculate();
  });
  // Recalculate durations when break times change
  startInput.addEventListener('change', recalculate);
  endInput.addEventListener('change', recalculate);
  div.appendChild(startInput);
  div.appendChild(endInput);
  div.appendChild(removeBtn);
  breaksContainer.appendChild(div);
}

// Attach event listeners to form fields for live calculation
[startTimeInput, endTimeInput, netEarningsInput, milesStartInput, milesEndInput, gallonsUsedInput, dollarsPerGalInput].forEach(el => {
  el.addEventListener('input', recalculate);
});

// Format odometer inputs with commas on blur
[milesStartInput, milesEndInput].forEach(input => {
  input.addEventListener('blur', () => {
    const value = parseCommaNumber(input.value);
    if (!isNaN(value)) {
      input.value = formatWithCommas(value);
    }
    recalculate();
  });
});

// Add break button handler
addBreakBtn.addEventListener('click', () => {
  addBreakRow();
});

// Form submission handler
form.addEventListener('submit', event => {
  event.preventDefault();
  // Parse inputs
  const date = dateInput.value;
  const start = startTimeInput.value;
  const end = endTimeInput.value;
  // Treat the input as gross pay (before expenses)
  const grossPay = parseFloat(netEarningsInput.value) || 0;
  const milesStart = parseCommaNumber(milesStartInput.value) || 0;
  const milesEnd = parseCommaNumber(milesEndInput.value) || 0;
  const milesDriven = parseFloat(milesDrivenEl.value) || 0;
  const gallons = parseFloat(gallonsUsedInput.value) || 0;
  const pricePerGal = parseFloat(dollarsPerGalInput.value) || 0;
  const gasCost = parseFloat(gasCostEl.value) || 0;
  // Net profit after subtracting gas cost
  const netProfit = grossPay - gasCost;
  const shiftMinutes = calculateTimeDifferenceMinutes(start, end);
  const breakMinutes = getTotalBreakMinutes();
  const workingMinutes = Math.max(shiftMinutes - breakMinutes, 0);
  const hourly = workingMinutes > 0 ? netProfit / (workingMinutes / 60) : 0;
  // Build breaks array for persistence
  const breaks = [];
  breaksContainer.querySelectorAll('.break-entry').forEach(entry => {
    const bStart = entry.querySelector('.break-start').value;
    const bEnd = entry.querySelector('.break-end').value;
    if (bStart && bEnd) {
      breaks.push({ start: bStart, end: bEnd });
    }
  });
  // Create entry object
  const entry = {
    date,
    start,
    end,
    shiftMinutes,
    breakMinutes,
    workingMinutes,
    // Net profit (earnings after gas)
    net: netProfit,
    // Gross pay (earnings before gas)
    gross: grossPay,
    milesStart,
    milesEnd,
    milesDriven,
    gallons,
    pricePerGal,
    gasCost,
    hourly,
    breaks
  };
  entries.push(entry);
  // Save to IndexedDB and update UI
  saveEntries().then(() => {
    renderEntries();
    updateSummaries();
  }).catch(err => {
    console.error('Failed to save entry:', err);
    // Still update UI even if save fails
    renderEntries();
    updateSummaries();
  });
  // Reset form and computed fields
  form.reset();
  shiftDurationEl.value = '';
  workingDurationEl.value = '';
  milesDrivenEl.value = '';
  gasCostEl.value = '';
  grossEarningsEl.value = '';
  hourlyRateEl.value = '';
  // Clear breaks UI
  breaksContainer.innerHTML = '';
});

/**
 * Render entries into the entries container as a table.
 */
function renderEntries() {
  entriesContainer.innerHTML = '';
  if (entries.length === 0) {
    entriesContainer.textContent = 'No shifts recorded yet.';
    return;
  }
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Date</th>
      <th>Start</th>
      <th>End</th>
      <th>Breaks</th>
      <th>Working (hrs)</th>
      <th>Gross pay ($)</th>
      <th>Net profit ($)</th>
      <th>Hourly (net)</th>
      <th>Miles driven</th>
      <th></th>
    </tr>
  `;
  const tbody = document.createElement('tbody');
  entries.forEach((entry, index) => {
    const tr = document.createElement('tr');
    const workingHours = (entry.workingMinutes / 60).toFixed(2);
    tr.innerHTML = `
      <td>${entry.date}</td>
      <td>${entry.start}</td>
      <td>${entry.end}</td>
      <td>${entry.breaks.length} (${formatMinutes(entry.breakMinutes)})</td>
      <td>${workingHours}</td>
      <td>${entry.gross.toFixed(2)}</td>
      <td>${entry.net.toFixed(2)}</td>
      <td>${entry.hourly.toFixed(2)}</td>
      <td>${entry.milesDriven.toFixed(2)}</td>
      <td><button class="delete-btn" data-index="${index}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(thead);
  table.appendChild(tbody);
  entriesContainer.appendChild(table);
  // Attach delete handlers
  const deleteButtons = entriesContainer.querySelectorAll('.delete-btn');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', evt => {
      const idx = parseInt(evt.target.dataset.index, 10);
      entries.splice(idx, 1);
      // Save to IndexedDB and update UI
      saveEntries().then(() => {
        renderEntries();
        updateSummaries();
      }).catch(err => {
        console.error('Failed to delete entry:', err);
        // Still update UI even if save fails
        renderEntries();
        updateSummaries();
      });
    });
  });
}

/**
 * Calculate ISO week number for a given date. Monday is considered the first day of the week.
 * @param {Date} dt
 * @returns {number}
 */
function getWeekNumber(dt) {
  const date = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

/**
 * Update weekly and overall summaries shown in the UI.
 */
function updateSummaries() {
  if (entries.length === 0) {
    weekSummaryEl.textContent = '–';
    overallSummaryEl.textContent = '–';
    avgHourlySummaryEl.textContent = '–';
    return;
  }
  const now = new Date();
  const currentWeek = getWeekNumber(now);
  const currentYear = now.getFullYear();
  let weekNet = 0;
  let weekGross = 0;
  let weekMinutes = 0;
  let totalNet = 0;
  let totalGross = 0;
  let totalMinutes = 0;
  entries.forEach(entry => {
    totalNet += entry.net;
    totalGross += entry.gross;
    totalMinutes += entry.workingMinutes;
    // Determine entry week number
    const entryDate = new Date(entry.date);
    const entryWeek = getWeekNumber(entryDate);
    const entryYear = entryDate.getFullYear();
    if (entryWeek === currentWeek && entryYear === currentYear) {
      weekNet += entry.net;
      weekGross += entry.gross;
      weekMinutes += entry.workingMinutes;
    }
  });
  weekSummaryEl.textContent = `${weekNet.toFixed(2)} / ${weekGross.toFixed(2)}`;
  overallSummaryEl.textContent = `${totalNet.toFixed(2)} / ${totalGross.toFixed(2)}`;
  // Average hourly: use total working time
  if (totalMinutes > 0) {
    const netHourly = totalNet / (totalMinutes / 60);
    const grossHourly = totalGross / (totalMinutes / 60);
    avgHourlySummaryEl.textContent = `${netHourly.toFixed(2)} / ${grossHourly.toFixed(2)}`;
  } else {
    avgHourlySummaryEl.textContent = '–';
  }
}

/**
 * Export all entries to a CSV file.
 */
function exportToCsv() {
  if (entries.length === 0) return;
  const header = [
    'Date',
    'Start',
    'End',
    'Shift Duration (min)',
    'Break Duration (min)',
    'Working Duration (min)',
    'Gross Pay',
    'Net Profit',
    'Hourly Rate (net)',
    'Miles Start',
    'Miles End',
    'Miles Driven',
    'Gallons Used',
    'Price/gal',
    'Gas Cost',
    'Breaks'
  ];
  const rows = entries.map(entry => {
    const breaksStr = entry.breaks
      .map(b => `${b.start}-${b.end}`)
      .join('|');
    return [
      entry.date,
      entry.start,
      entry.end,
      entry.shiftMinutes,
      entry.breakMinutes,
      entry.workingMinutes,
      entry.gross.toFixed(2),
      entry.net.toFixed(2),
      entry.hourly.toFixed(2),
      entry.milesStart.toFixed(2),
      entry.milesEnd.toFixed(2),
      entry.milesDriven.toFixed(2),
      entry.gallons.toFixed(2),
      entry.pricePerGal.toFixed(2),
      entry.gasCost.toFixed(2),
      breaksStr
    ].join(',');
  });
  const csvContent = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashtrack_data_${new Date().toISOString().slice(0, 10)}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export button handler (now handled in admin menu)
// exportCsvBtn.addEventListener('click', exportToCsv);

// Global function to update storage status
function updateStorageStatus() {
  const storageStatusText = document.getElementById('storageStatusText');
  const storageStatusSection = document.getElementById('storageStatusSection');
  if (!storageStatusText || !storageStatusSection) return;
  
  if (db) {
    // Don't show anything if using IndexedDB
    storageStatusSection.style.display = 'none';
  } else {
    // Only show warning if using localStorage fallback
    storageStatusText.innerHTML = '<span style="color: #FF9800;">⚠ Using localStorage fallback - data may be less persistent</span>';
    storageStatusSection.style.display = 'block';
  }
}

// Initialize admin menu functionality
function initAdminMenu() {
  const adminMenuBtn = document.getElementById('adminMenuBtn');
  const adminDropdown = document.getElementById('adminDropdown');
  const closeAdminBtn = document.getElementById('closeAdminBtn');
  
  // Toggle admin menu
  function toggleAdminMenu() {
    const isOpen = adminDropdown.classList.contains('show');
    if (isOpen) {
      adminDropdown.classList.remove('show');
      adminMenuBtn.classList.remove('active');
    } else {
      adminDropdown.classList.add('show');
      adminMenuBtn.classList.add('active');
      updateStorageStatus();
    }
  }
  
  // Close admin menu
  function closeAdminMenu() {
    adminDropdown.classList.remove('show');
    adminMenuBtn.classList.remove('active');
  }
  
  // Event listeners
  adminMenuBtn.addEventListener('click', toggleAdminMenu);
  closeAdminBtn.addEventListener('click', closeAdminMenu);
  
  // Close menu when clicking outside
  document.addEventListener('click', (event) => {
    if (!adminMenuBtn.contains(event.target) && !adminDropdown.contains(event.target)) {
      closeAdminMenu();
    }
  });
  
  // Close menu on escape key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAdminMenu();
    }
  });
  
  // Initialize storage status
  updateStorageStatus();
  
  // Add event handlers for admin buttons
  document.getElementById('exportCsvBtn').addEventListener('click', exportToCsv);
  document.getElementById('exportJsonBtn').addEventListener('click', exportToJson);
  document.getElementById('importJsonBtn').addEventListener('click', () => {
    document.getElementById('importJsonInput').click();
  });
  document.getElementById('importJsonInput').addEventListener('change', importFromJson);
  document.getElementById('clearAllDataBtn').addEventListener('click', () => {
    showClearDataConfirmation();
  });
}

/**
 * Show custom confirmation modal for clearing all data
 */
function showClearDataConfirmation() {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'clear-data-modal';
  modal.innerHTML = `
    <div class="clear-data-content">
      <h3>⚠️ Clear All Data</h3>
      <p>This action will permanently delete ALL your shift data. This cannot be undone.</p>
      <p><strong>To confirm, type "CLEAR ALL DATA" below:</strong></p>
      <input type="text" id="clearDataInput" placeholder="Type CLEAR ALL DATA" class="clear-data-input">
      <div class="clear-data-buttons">
        <button id="cancelClearBtn" class="admin-btn">Cancel</button>
        <button id="confirmClearBtn" class="admin-btn danger" disabled>Clear All Data</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const input = modal.querySelector('#clearDataInput');
  const confirmBtn = modal.querySelector('#confirmClearBtn');
  const cancelBtn = modal.querySelector('#cancelClearBtn');
  
  // Enable/disable confirm button based on input
  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value !== 'CLEAR ALL DATA';
  });
  
  // Handle confirmation
  confirmBtn.addEventListener('click', async () => {
    if (input.value === 'CLEAR ALL DATA') {
      entries = [];
      try {
        await saveEntries();
        renderEntries();
        updateSummaries();
        alert('All data has been cleared.');
        modal.remove();
      } catch (err) {
        console.error('Failed to clear data:', err);
        alert('Failed to clear data. Please try again.');
      }
    }
  });
  
  // Handle cancellation
  cancelBtn.addEventListener('click', () => {
    modal.remove();
  });
  
  // Close on escape key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modal.remove();
    }
  });
  
  // Focus input
  input.focus();
}

/**
 * Export all entries to a JSON file
 */
function exportToJson() {
  if (entries.length === 0) return;
  
  const data = {
    exportDate: new Date().toISOString(),
    version: '1.0',
    entries: entries
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dashtrack_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import entries from a JSON file
 */
function importFromJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.entries && Array.isArray(data.entries)) {
        // Merge with existing entries, avoiding duplicates by date
        const existingDates = new Set(entries.map(e => e.date));
        const newEntries = data.entries.filter(e => !existingDates.has(e.date));
        
        if (newEntries.length > 0) {
          entries = [...entries, ...newEntries];
          await saveEntries();
          renderEntries();
          updateSummaries();
          alert(`Successfully imported ${newEntries.length} new entries.`);
        } else {
          alert('No new entries to import (all dates already exist).');
        }
      } else {
        alert('Invalid backup file format.');
      }
    } catch (err) {
      console.error('Failed to parse backup file:', err);
      alert('Failed to parse backup file. Please check the file format.');
    }
  };
  reader.readAsText(file);
  
  // Reset file input
  event.target.value = '';
}

// Load stored entries on startup
async function loadEntries() {
  try {
    await initDB(); // Initialize IndexedDB
    const storedEntries = await loadEntriesFromDB();
    if (storedEntries && storedEntries.length > 0) {
      entries = storedEntries;
      console.log('Loaded entries from IndexedDB:', storedEntries.length);
    } else {
      // Fallback to localStorage if IndexedDB is empty
      const fallbackData = localStorage.getItem('dashtrack_entries');
      if (fallbackData) {
        try {
          const parsed = JSON.parse(fallbackData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            entries = parsed;
            console.log('Loaded entries from localStorage fallback:', parsed.length);
            // Migrate to IndexedDB
            await saveEntries();
          }
        } catch (err) {
          console.error('Failed to parse localStorage fallback:', err);
        }
      }
    }
  } catch (err) {
    console.error('IndexedDB failed, falling back to localStorage:', err);
    // Fallback to localStorage
    const fallbackData = localStorage.getItem('dashtrack_entries');
    if (fallbackData) {
      try {
        const parsed = JSON.parse(fallbackData);
        if (Array.isArray(parsed)) {
          entries = parsed;
        }
      } catch (err) {
        console.error('Failed to parse localStorage fallback:', err);
      }
    }
  }
  
  renderEntries();
  updateSummaries();
  // Set default gas price on load if input is empty
  if (!dollarsPerGalInput.value) {
    dollarsPerGalInput.value = DEFAULT_GAS_PRICE.toFixed(3);
  }
  recalculate();
}

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .catch(err => console.error('Service worker registration failed:', err));
  });
}

// Initialise
loadEntries().then(() => {
  // Initialize admin menu after data is loaded
  initAdminMenu();
}).catch(err => {
  console.error('Failed to initialize app:', err);
  // Still initialize admin menu even if loading fails
  initAdminMenu();
});
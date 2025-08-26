/*
 * DashTrack application logic
 *
 * Handles form input, calculation of durations, miles, gas costs and hourly rates,
 * persists shift data to localStorage, displays recorded shifts, allows deletion,
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
  localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
  renderEntries();
  updateSummaries();
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
      localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
      renderEntries();
      updateSummaries();
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

// Export button handler
exportCsvBtn.addEventListener('click', exportToCsv);

// Load stored entries on startup
function loadEntries() {
  const stored = localStorage.getItem('dashtrack_entries');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        entries = parsed;
      }
    } catch (err) {
      console.error('Failed to parse stored data', err);
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
loadEntries();
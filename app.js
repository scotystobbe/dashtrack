/*
 * DashTrack application logic
 *
 * Handles form input, calculation of durations, miles, gas costs and hourly rates,
 * persists shift data to Supabase cloud database, displays recorded shifts, allows deletion,
 * exports data to CSV, and calculates weekly and overall summaries. Breaks are
 * supported: users can add any number of break intervals which reduce the
 * working time for the shift. All computations are updated live on input.
 */

// Import Supabase client
import { supabase, SHIFTS_TABLE } from './supabase.js';

// Debug logging
console.log('App.js loaded, checking environment variables...');
try {
  if (import.meta && import.meta.env) {
    console.log('SUPABASE_URL available:', !!import.meta.env.SUPABASE_URL);
    console.log('SUPABASE_ANON_KEY available:', !!import.meta.env.SUPABASE_ANON_KEY);
  } else {
    console.log('import.meta.env not available - running in browser environment');
  }
} catch (error) {
  console.log('import.meta not available - running in browser environment');
}

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

// Debug DOM elements
console.log('DOM elements found:', {
  form: !!form,
  dateInput: !!dateInput,
  startTimeInput: !!startTimeInput,
  endTimeInput: !!endTimeInput,
  addBreakBtn: !!addBreakBtn,
  breaksContainer: !!breaksContainer
});

// Constants
// Default MPG used to compute gallons (30.9 miles per gallon)
const MPG = 30.9;
// Default gas price for ZIP 84062 derived from AAA Provo‑Orem metro average【710179261405807†L146-L152】.
const DEFAULT_GAS_PRICE = 3.272;

// State
let entries = [];
let editingIndex = -1; // Track which entry is being edited (-1 means not editing)
let isSettingUpEdit = false; // Flag to prevent form submission during edit setup

// Supabase table name
const SHIFTS_TABLE_NAME = SHIFTS_TABLE;

/**
 * Initialize Supabase connection
 */
async function initSupabase() {
  try {
    // Test the connection by fetching a single record
    const { data, error } = await supabase
      .from(SHIFTS_TABLE_NAME)
      .select('id')
      .limit(1);
    
    if (error) {
      console.error('Supabase connection error:', error);
      throw error;
    }
    
    console.log('Supabase connected successfully');
    
    // Update storage status if admin menu is initialized
    if (typeof updateStorageStatus === 'function') {
      updateStorageStatus();
    }
    
    return true;
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
    throw error;
  }
}

/**
 * Save a single entry to Supabase
 */
async function saveEntry(entry, isUpdate = false) {
  try {
    if (isUpdate && entry.id) {
      // Update existing record
      const { data, error } = await supabase
        .from(SHIFTS_TABLE_NAME)
        .update(entry)
        .eq('id', entry.id);
      
      if (error) {
        console.error('Error updating entry:', error);
        throw error;
      }
      
      console.log('Entry updated in Supabase:', data);
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from(SHIFTS_TABLE_NAME)
        .insert([entry])
        .select(); // Return the inserted data with ID
      
      if (error) {
        console.error('Error saving entry:', error);
        throw error;
      }
      
      // Update the local entry with the database ID
      if (data && data.length > 0) {
        const savedEntry = data[0];
        Object.assign(entry, savedEntry);
        console.log('Entry saved to Supabase:', savedEntry);
      }
    }
    
    // Also save to localStorage as backup
    try {
      localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
    } catch (localStorageErr) {
      console.warn('Failed to save to localStorage backup:', localStorageErr);
    }
    
  } catch (err) {
    console.error('Failed to save to Supabase, falling back to localStorage:', err);
    // Fallback to localStorage
    try {
      localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
    } catch (localStorageErr) {
      throw new Error('All storage methods failed');
    }
  }
}

/**
 * Delete a single entry from Supabase
 */
async function deleteEntry(entry) {
  try {
    if (entry.id) {
      const { error } = await supabase
        .from(SHIFTS_TABLE_NAME)
        .delete()
        .eq('id', entry.id);
      
      if (error) {
        console.error('Error deleting entry:', error);
        throw error;
      }
      
      console.log('Entry deleted from Supabase');
    }
    
    // Also update localStorage backup
    try {
      localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
    } catch (localStorageErr) {
      console.warn('Failed to update localStorage backup:', localStorageErr);
    }
    
  } catch (err) {
    console.error('Failed to delete from Supabase:', err);
    // Still update localStorage
    try {
      localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
    } catch (localStorageErr) {
      console.warn('Failed to update localStorage backup:', localStorageErr);
    }
  }
}

/**
 * Save all entries to Supabase (used for initial migration/import)
 */
async function saveAllEntries() {
  try {
    // Clear existing data first (only for full migrations)
    const { error: deleteError } = await supabase
      .from(SHIFTS_TABLE_NAME)
      .delete()
      .neq('id', 0); // Delete all records
    
    if (deleteError) {
      console.error('Error clearing existing data:', deleteError);
      throw deleteError;
    }
    
    // Insert all entries
    if (entries.length > 0) {
      const { data, error } = await supabase
        .from(SHIFTS_TABLE_NAME)
        .insert(entries)
        .select(); // Return the inserted data with IDs
      
      if (error) {
        console.error('Error saving entries:', error);
        throw error;
      }
      
      // Update local entries with database IDs
      if (data && data.length > 0) {
        entries = data;
        console.log('All entries saved to Supabase:', data.length);
      }
    }
    
    // Also save to localStorage as backup
    try {
      localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
    } catch (localStorageErr) {
      console.warn('Failed to save to localStorage backup:', localStorageErr);
    }
    
  } catch (err) {
    console.error('Failed to save to Supabase, falling back to localStorage:', err);
    // Fallback to localStorage
    try {
      localStorage.setItem('dashtrack_entries', JSON.stringify(entries));
    } catch (localStorageErr) {
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
 * Utility: parse a time string (e.g., "8:31 PM", "12:08 AM") into minutes.
 * If the end time is smaller than the start time (i.e., crosses midnight),
 * add 24 hours. Times are strings in 12-hour format.
 * @param {string} start - start time (e.g., "8:31 PM")
 * @param {string} end - end time (e.g., "12:08 AM")
 * @returns {number} duration in minutes
 */
function calculateTimeDifferenceMinutes(start, end) {
  if (!start || !end) return 0;
  
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  
  if (startMinutes === null || endMinutes === null) return 0;
  
  let duration = endMinutes - startMinutes;
  // if crossing midnight, add 24h to end
  if (duration < 0) {
    duration += 24 * 60;
  }
  return duration;
}

/**
 * Parse a 12-hour time string to minutes since midnight
 * @param {string} timeStr - time string like "8:31 PM" or "12:08 AM"
 * @returns {number|null} minutes since midnight, or null if invalid
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  
  // Remove extra spaces and convert to uppercase
  const cleanTime = timeStr.trim().toUpperCase();
  
  // Match patterns like "8:31 PM", "12:08 AM", "8:31PM", etc.
  const match = cleanTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3];
  
  // Validate hours and minutes
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
  
  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  return hours * 60 + minutes;
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
 * Auto-format time input to proper case (e.g., "8:31 pm" -> "8:31 PM")
 * @param {HTMLInputElement} input - the time input element
 */
function formatTimeInput(input) {
  console.log('formatTimeInput called with:', input?.value);
  if (!input.value.trim()) return;
  
  const timeStr = input.value.trim();
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm|AM|PM|Am|Pm|aM|pM)$/i);
  
  if (match) {
    const hours = match[1];
    const minutes = match[2];
    const period = match[3].toUpperCase();
    const formatted = `${hours}:${minutes} ${period}`;
    input.value = formatted;
    console.log('Formatted time:', timeStr, '->', formatted);
  } else {
    console.log('Time format not matched:', timeStr);
  }
}

/**
 * Validate time input (no visual feedback, just validation)
 * @param {HTMLInputElement} input - the time input element
 * @returns {boolean} true if valid, false if invalid
 */
function validateTimeInput(input) {
  if (!input.value.trim()) {
    return true; // Empty is considered valid (not required)
  }
  
  return parseTimeToMinutes(input.value) !== null;
}

/**
 * Recalculate all derived fields based on current inputs.
 */
function recalculate() {
  console.log('Recalculate called with values:', {
    startTime: startTimeInput?.value,
    endTime: endTimeInput?.value,
    milesStart: milesStartInput?.value,
    milesEnd: milesEndInput?.value,
    grossPay: netEarningsInput?.value
  });
  
  // Compute total shift and break durations
  const shiftMinutes = calculateTimeDifferenceMinutes(startTimeInput.value, endTimeInput.value);
  const breakMinutes = getTotalBreakMinutes();
  const workingMinutes = Math.max(shiftMinutes - breakMinutes, 0);
  if (shiftMinutes > 0) {
    shiftDurationEl.textContent = formatMinutes(shiftMinutes);
  } else {
    shiftDurationEl.textContent = '–';
  }
  if (workingMinutes > 0) {
    workingDurationEl.textContent = formatMinutes(workingMinutes);
  } else {
    workingDurationEl.textContent = '–';
  }
  // Miles driven
  const milesStart = parseCommaNumber(milesStartInput.value);
  const milesEnd = parseCommaNumber(milesEndInput.value);
  let miles = NaN;
  if (!isNaN(milesStart) && !isNaN(milesEnd)) {
    miles = milesEnd - milesStart;
    milesDrivenEl.textContent = Math.round(miles).toString();
  } else {
    milesDrivenEl.textContent = '–';
  }
  // Gallons used: automatically computed from miles driven and a fixed MPG (30.9 mpg)
  let gallons = NaN;
  if (!isNaN(miles)) {
    gallons = miles / MPG;
    gallonsUsedInput.textContent = gallons.toFixed(2);
  } else {
    gallonsUsedInput.textContent = '–';
  }
  // Gas cost
  const pricePerGal = parseFloat(dollarsPerGalInput.textContent.replace('$', ''));
  let gasCost = 0;
  if (!isNaN(gallons) && !isNaN(pricePerGal)) {
    gasCost = gallons * pricePerGal;
    gasCostEl.textContent = '$' + gasCost.toFixed(2);
  } else {
    gasCostEl.textContent = '–';
  }
  // Gross pay from input
  const grossPay = parseFloat(netEarningsInput.value);
  if (!isNaN(grossPay)) {
    // Net profit = gross pay minus gas cost
    const netProfit = grossPay - (gasCost || 0);
    grossEarningsEl.textContent = '$' + netProfit.toFixed(2);
  } else {
    grossEarningsEl.textContent = '–';
  }
  // Hourly earnings based on net profit
  if (!isNaN(grossPay) && workingMinutes > 0) {
    const netProfit = grossPay - (gasCost || 0);
    const hours = workingMinutes / 60;
    const hourly = netProfit / hours;
    hourlyRateEl.textContent = '$' + hourly.toFixed(2);
  } else {
    hourlyRateEl.textContent = '–';
  }
}

/**
 * Edit an existing shift entry
 * @param {number} index - index of the entry to edit
 */
function editEntry(index) {
  const entry = entries[index];
  if (!entry) return;
  
  console.log('Editing entry at index:', index, 'Entry:', entry);
  console.log('Entry keys:', Object.keys(entry));
  console.log('Entry values:', Object.values(entry));
  
  // Set flag to prevent form submission during setup
  isSettingUpEdit = true;
  
  // Populate form with entry data
  console.log('Populating form fields...');
  console.log('Date input:', dateInput, 'Value:', entry.date);
  console.log('Start time input:', startTimeInput, 'Value:', entry.start);
  console.log('End time input:', endTimeInput, 'Value:', entry.end);
  console.log('Net earnings input:', netEarningsInput, 'Value:', entry.gross);
  console.log('Miles start input:', milesStartInput, 'Value:', entry.milesStart);
  console.log('Miles end input:', milesEndInput, 'Value:', entry.milesEnd);
  
  dateInput.value = entry.date;
  startTimeInput.value = entry.start;
  endTimeInput.value = entry.end;
  netEarningsInput.value = entry.gross.toFixed(2);
  milesStartInput.value = entry.milesStart.toFixed(0);
  milesEndInput.value = entry.milesEnd.toFixed(0);
  
  console.log('After setting values:');
  console.log('Date input value:', dateInput.value);
  console.log('Start time input value:', startTimeInput.value);
  console.log('End time input value:', endTimeInput.value);
  console.log('Net earnings input value:', netEarningsInput.value);
  console.log('Miles start input value:', milesStartInput.value);
  console.log('Miles end input value:', milesEndInput.value);
  
  // Clear existing breaks and add entry breaks
  breaksContainer.innerHTML = '';
  if (entry.breaks && entry.breaks.length > 0) {
    entry.breaks.forEach(breakEntry => {
      addBreakRow(breakEntry.start, breakEntry.end);
    });
  }
  
  // Change form submit behavior to update instead of add
  editingIndex = index;
  
  // Recalculate to update display fields (after setting edit mode)
  recalculate();
  
  console.log('Set edit mode - index:', editingIndex);
  
  // Update submit button text
  const submitBtn = form.querySelector('button.submit');
  console.log('Submit button found:', submitBtn);
  if (submitBtn) {
    submitBtn.textContent = 'Update Shift';
    console.log('Submit button text changed to:', submitBtn.textContent);
  } else {
    console.error('Submit button not found!');
  }
  
  // Add delete button to form
  let deleteBtn = form.querySelector('.delete-edit-btn');
  if (!deleteBtn) {
    deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.classList.add('delete-edit-btn');
    deleteBtn.textContent = 'Delete Shift';
    deleteBtn.style.backgroundColor = '#dc3545';
    deleteBtn.style.marginLeft = '10px';
    deleteBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this shift?')) {
        const entryToDelete = entries[index];
        entries.splice(index, 1);
        deleteEntry(entryToDelete).then(() => {
          renderEntries();
          updateSummaries();
          resetForm();
        }).catch(err => {
          console.error('Failed to delete entry:', err);
          renderEntries();
          updateSummaries();
          resetForm();
        });
      }
    });
    submitBtn.parentNode.appendChild(deleteBtn);
  }
  
  // Scroll to form
  form.scrollIntoView({ behavior: 'smooth' });
  
  // Clear the setup flag after a short delay to allow form to settle
  setTimeout(() => {
    isSettingUpEdit = false;
    console.log('Edit setup complete, form submission now allowed');
  }, 100);
}

/**
 * Reset form to add mode
 */
function resetForm() {
  editingIndex = -1;
  
  // Reset form and computed fields
  form.reset();
  shiftDurationEl.textContent = '–';
  workingDurationEl.textContent = '–';
  milesDrivenEl.textContent = '–';
  gallonsUsedInput.textContent = '–';
  dollarsPerGalInput.textContent = '$' + DEFAULT_GAS_PRICE.toFixed(2);
  gasCostEl.textContent = '–';
  grossEarningsEl.textContent = '–';
  hourlyRateEl.textContent = '–';
  
  // Clear breaks UI
  breaksContainer.innerHTML = '';
  
  // Update submit button text
  const submitBtn = form.querySelector('button.submit');
  submitBtn.textContent = 'Add Shift';
  
  // Remove delete button
  const deleteBtn = form.querySelector('.delete-edit-btn');
  if (deleteBtn) {
    deleteBtn.remove();
  }
}

/**
 * Add a new break row to the breaks container.
 */
function addBreakRow(startValue = '', endValue = '') {
  console.log('addBreakRow called with:', { startValue, endValue });
  console.log('breaksContainer exists:', !!breaksContainer);
  
  const div = document.createElement('div');
  div.classList.add('break-entry');
  const startInput = document.createElement('input');
  startInput.type = 'text';
  startInput.classList.add('break-start');
  startInput.value = startValue;
  const endInput = document.createElement('input');
  endInput.type = 'text';
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
  startInput.addEventListener('input', recalculate);
  endInput.addEventListener('input', recalculate);
  
  // Add time formatting and validation for break inputs
  startInput.addEventListener('blur', () => {
    formatTimeInput(startInput);
    validateTimeInput(startInput);
  });
  endInput.addEventListener('blur', () => {
    formatTimeInput(endInput);
    validateTimeInput(endInput);
  });
  div.appendChild(startInput);
  div.appendChild(endInput);
  div.appendChild(removeBtn);
  breaksContainer.appendChild(div);
  console.log('Break row added successfully');
}

// Attach event listeners to form fields for live calculation
console.log('Setting up form event listeners...');
[startTimeInput, endTimeInput, netEarningsInput, milesStartInput, milesEndInput, gallonsUsedInput].forEach(el => {
  if (el) {
  el.addEventListener('input', recalculate);
    console.log('Added input listener to:', el.id);
  } else {
    console.warn('Element not found for input listener');
  }
});

// Add time validation and formatting for start and end time inputs
[startTimeInput, endTimeInput].forEach(input => {
  if (input) {
    input.addEventListener('blur', () => {
      formatTimeInput(input);
      validateTimeInput(input);
    });
    console.log('Added blur listener to:', input.id);
  }
});

// Format odometer inputs with commas on blur
[milesStartInput, milesEndInput].forEach(input => {
  if (input) {
  input.addEventListener('blur', () => {
    const value = parseCommaNumber(input.value);
    if (!isNaN(value)) {
      input.value = formatWithCommas(value);
    }
    recalculate();
  });
    console.log('Added odometer blur listener to:', input.id);
  }
});

// Add break button handler
if (addBreakBtn) {
addBreakBtn.addEventListener('click', () => {
    console.log('Add break button clicked!');
  addBreakRow();
});
  console.log('Added click listener to add break button');
} else {
  console.error('Add break button not found!');
}

// Form submission handler
if (form) {
form.addEventListener('submit', event => {
    console.log('Form submission event triggered');
  event.preventDefault();
    
    // Prevent submission if we're still setting up edit mode
    if (isSettingUpEdit) {
      console.log('Form submission blocked - still setting up edit mode');
      return;
    }
    
    // Validate time inputs before submission
    if (!validateTimeInput(startTimeInput) || !validateTimeInput(endTimeInput)) {
      alert('Please enter valid start and end times in the format "8:31 PM" or "12:08 AM"');
      return;
    }
    
    // Check if we're in edit mode
    const isEditMode = editingIndex >= 0;
    const editIndex = editingIndex;
    
    console.log('Form submission - Edit mode:', isEditMode, 'Edit index:', editIndex);
  
  // Parse inputs
  const date = dateInput.value;
  const start = startTimeInput.value;
  const end = endTimeInput.value;
  // Treat the input as gross pay (before expenses)
  const grossPay = parseFloat(netEarningsInput.value) || 0;
  const milesStart = parseCommaNumber(milesStartInput.value) || 0;
  const milesEnd = parseCommaNumber(milesEndInput.value) || 0;
  const milesDriven = parseFloat(milesDrivenEl.textContent) || 0;
  const gallons = parseFloat(gallonsUsedInput.textContent) || 0;
  const pricePerGal = parseFloat(dollarsPerGalInput.textContent.replace('$', '')) || 0;
  const gasCost = parseFloat(gasCostEl.textContent.replace('$', '')) || 0;
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
  
  if (isEditMode && editIndex >= 0) {
    // Update existing entry
    const existingEntry = entries[editIndex];
    entry.id = existingEntry.id; // Preserve the database ID
    entries[editIndex] = entry;
    console.log('Updated existing entry at index:', editIndex);
    
    // Save individual entry update
    saveEntry(entry, true).then(() => {
      renderEntries();
      updateSummaries();
    }).catch(err => {
      console.error('Failed to update entry:', err);
      // Still update UI even if save fails
      renderEntries();
      updateSummaries();
    });
  } else {
    // Add new entry
    entries.push(entry);
    console.log('Added new entry');
    
    // Save individual new entry
    saveEntry(entry, false).then(() => {
      renderEntries();
      updateSummaries();
    }).catch(err => {
      console.error('Failed to save entry:', err);
      // Still update UI even if save fails
      renderEntries();
      updateSummaries();
    });
  }
  
  // Reset form and exit edit mode
  resetForm();
  });
} else {
  console.error('Form not found!');
}

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
      <th>Hours</th>
      <th>Gross</th>
      <th>Net</th>
      <th>Hourly</th>
      <th></th>
    </tr>
  `;
  const tbody = document.createElement('tbody');
  entries.forEach((entry, index) => {
    const tr = document.createElement('tr');
    const workingHours = (entry.workingMinutes / 60).toFixed(2);
    tr.innerHTML = `
      <td>${formatDate(entry.date)}</td>
      <td>${workingHours}</td>
      <td>$${entry.gross.toFixed(2)}</td>
      <td>$${entry.net.toFixed(2)}</td>
      <td>$${entry.hourly.toFixed(2)}</td>
      <td><button class="edit-btn" data-index="${index}">Edit</button></td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(thead);
  table.appendChild(tbody);
  entriesContainer.appendChild(table);
  // Attach edit handlers
  const editButtons = entriesContainer.querySelectorAll('.edit-btn');
  editButtons.forEach(btn => {
    btn.addEventListener('click', evt => {
      const idx = parseInt(evt.target.dataset.index, 10);
      editEntry(idx);
    });
  });
}

/**
 * Format date from ISO string to M/D/YY format
 * @param {string} dateString - ISO date string (e.g., "2025-08-25")
 * @returns {string} - Formatted date (e.g., "8/25/25")
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  const month = date.getMonth() + 1; // getMonth() returns 0-11
  const day = date.getDate();
  const year = date.getFullYear().toString().slice(-2); // Get last 2 digits of year
  return `${month}/${day}/${year}`;
}

/**
 * Calculate week number for a given date. Sunday is considered the first day of the week.
 * @param {Date} dt
 * @returns {number}
 */
function getWeekNumber(dt) {
  const date = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  // Set to nearest Saturday: current date + 6 - current day number
  const dayNum = date.getDay();
  date.setDate(date.getDate() + 6 - dayNum);
  const yearStart = new Date(date.getFullYear(), 0, 1);
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
  
  // Update UI based on toggle state
  if (showGrossValues) {
    weekSummaryEl.textContent = `$${weekGross.toFixed(2)}`;
    overallSummaryEl.textContent = `$${totalGross.toFixed(2)}`;
  if (totalMinutes > 0) {
    const grossHourly = totalGross / (totalMinutes / 60);
      avgHourlySummaryEl.textContent = `$${grossHourly.toFixed(2)}`;
  } else {
    avgHourlySummaryEl.textContent = '–';
    }
  } else {
    weekSummaryEl.textContent = `$${weekNet.toFixed(2)}`;
    overallSummaryEl.textContent = `$${totalNet.toFixed(2)}`;
    if (totalMinutes > 0) {
      const netHourly = totalNet / (totalMinutes / 60);
      avgHourlySummaryEl.textContent = `$${netHourly.toFixed(2)}`;
    } else {
      avgHourlySummaryEl.textContent = '–';
    }
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
  
  // Check if Supabase is working by testing connection
  supabase.from(SHIFTS_TABLE_NAME).select('id').limit(1).then(({ error }) => {
    if (error) {
      // Show warning if Supabase is not working
      storageStatusText.innerHTML = '<span style="color: #FF9800;">⚠ Supabase connection failed - using localStorage fallback</span>';
      storageStatusSection.style.display = 'block';
    } else {
      // Don't show anything if using Supabase
      storageStatusSection.style.display = 'none';
    }
  }).catch(() => {
    // Show warning if Supabase connection fails
    storageStatusText.innerHTML = '<span style="color: #FF9800;">⚠ Supabase connection failed - using localStorage fallback</span>';
    storageStatusSection.style.display = 'block';
  });
}

// Global variable to track summary display mode
let showGrossValues = false;

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
          // Save each new entry individually
          for (const newEntry of newEntries) {
            entries.push(newEntry);
            await saveEntry(newEntry, false);
          }
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
    await initSupabase(); // Initialize Supabase connection
    
    // Load from Supabase
    const { data, error } = await supabase
      .from(SHIFTS_TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error loading from Supabase:', error);
      throw error;
    }
    
    if (data && data.length > 0) {
      entries = data;
      console.log('Loaded entries from Supabase:', data.length);
    } else {
      // Fallback to localStorage if Supabase is empty
      const fallbackData = localStorage.getItem('dashtrack_entries');
      if (fallbackData) {
        try {
          const parsed = JSON.parse(fallbackData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            entries = parsed;
            console.log('Loaded entries from localStorage fallback:', parsed.length);
            // Migrate to Supabase
            await saveAllEntries();
          }
        } catch (err) {
          console.error('Failed to parse localStorage fallback:', err);
        }
      }
    }
  } catch (err) {
    console.error('Supabase failed, falling back to localStorage:', err);
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
  // Set default gas price on load
  dollarsPerGalInput.textContent = '$' + DEFAULT_GAS_PRICE.toFixed(2);
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
  console.log('Data loaded successfully, initializing admin menu...');
  // Initialize admin menu after data is loaded
  initAdminMenu();
  
  // Initialize summary toggle
  const summaryToggle = document.getElementById('summaryToggle');
  if (summaryToggle) {
    console.log('Summary toggle found, adding event listener...');
    summaryToggle.addEventListener('change', (event) => {
      showGrossValues = event.target.checked;
      updateSummaries();
    });
  } else {
    console.warn('Summary toggle not found!');
  }
  
  console.log('Initialization complete!');
}).catch(err => {
  console.error('Failed to initialize app:', err);
  // Still initialize admin menu even if loading fails
  try {
    initAdminMenu();
    console.log('Admin menu initialized despite loading failure');
  } catch (adminErr) {
    console.error('Failed to initialize admin menu:', adminErr);
  }
});
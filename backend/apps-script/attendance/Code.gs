/**
 * Project: Bar/QR Code Scanner Web App
 * Developed By: bpwebs.com
 * 
 * This web app uses the html5-qrcode library from GitHub: https://github.com/mebjas/html5-qrcode.
 * The html5-qrcode library is used to scan QR codes from the user's webcam.
 */

//Constants
const DATASHEET = "Data";
const LOOKUPSHEET = "MemberLookup";


function doGet() {
  let template = HtmlService.createTemplateFromFile('Index');
  let html = template.evaluate().setTitle('6220 Attendance');

  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  html.addMetaTag('viewport', 'width=device-width, initial-scale=1');

  return html;
}


function processForm(formObject) {
  const ss = SpreadsheetApp.getActive();
  const dataSheet = ss.getSheetByName(DATASHEET);
  const lookupSheet = ss.getSheetByName(LOOKUPSHEET);
  
  const studentId = formObject.productCode;
  
  // Validate student ID is exactly 10 digits
  if (!/^\d{10}$/.test(studentId)) {
    return {
      success: false,
      message: "Invalid Student ID: Must be exactly 10 digits"
    };
  }
  
  // Look up student name
  const lookupData = lookupSheet.getDataRange().getValues();
  let studentName = null;
  
  // Skip header row (index 0), search for matching student ID
  for (let i = 1; i < lookupData.length; i++) {
    if (lookupData[i][0] && lookupData[i][0].toString() === studentId) {
      const firstName = lookupData[i][1] || "";
      const lastName = lookupData[i][2] || "";
      studentName = `${firstName} ${lastName}`.trim();
      break;
    }
  }
  
  // If student ID not found in lookup table
  if (!studentName) {
    return {
      success: false,
      needsRegistration: true,
      studentId: studentId,
      message: "Student ID not found in system"
    };
  }
  
  // Check if student has already signed in today
  const dataRange = dataSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let alreadySignedIn = false;
  let previousSignInTime = null;
  
  // Skip header row, check if this student ID has signed in today
  for (let i = 1; i < dataRange.length; i++) {
    const timestamp = new Date(dataRange[i][0]);
    timestamp.setHours(0, 0, 0, 0);
    
    if (timestamp.getTime() === today.getTime() && dataRange[i][1].toString() === studentId) {
      alreadySignedIn = true;
      previousSignInTime = new Date(dataRange[i][0]).toLocaleTimeString();
      break;
    }
  }
  
  // If already signed in, reject the attempt
  if (alreadySignedIn) {
    return {
      success: false,
      isDuplicate: true,
      name: studentName,
      previousTime: previousSignInTime,
      message: `${studentName}, you already signed in today at ${previousSignInTime}`
    };
  }
  
  // Record attendance (only if not a duplicate)
  dataSheet.appendRow([
    new Date().toLocaleString(),
    studentId
  ]);
  
  return {
    success: true,
    name: studentName,
    message: `Welcome, ${studentName}!`
  };
}


/**
 * Register a new student and record their attendance
 */
function registerNewStudent(studentId, firstName, lastName) {
  const ss = SpreadsheetApp.getActive();
  const lookupSheet = ss.getSheetByName(LOOKUPSHEET);
  const dataSheet = ss.getSheetByName(DATASHEET);
  
  // Validate inputs
  if (!firstName || !lastName || firstName.trim() === "" || lastName.trim() === "") {
    return {
      success: false,
      message: "First name and last name are required"
    };
  }
  
  // Validate student ID format
  if (!/^\d{10}$/.test(studentId)) {
    return {
      success: false,
      message: "Invalid Student ID: Must be exactly 10 digits"
    };
  }
  
  // Check if student already exists (shouldn't happen, but just in case)
  const lookupData = lookupSheet.getDataRange().getValues();
  for (let i = 1; i < lookupData.length; i++) {
    if (lookupData[i][0] && lookupData[i][0].toString() === studentId) {
      return {
        success: false,
        message: "Student ID already exists in system"
      };
    }
  }
  
  // Add new student to MemberLookup sheet
  // Format: Student ID #, First Name, Last Name, Main Subteam (empty)
  lookupSheet.appendRow([
    studentId,
    firstName.trim(),
    lastName.trim(),
    "" // Main Subteam - can be filled in later
  ]);
  
  // Record attendance
  dataSheet.appendRow([
    new Date().toLocaleString(),
    studentId
  ]);
  
  const fullName = `${firstName.trim()} ${lastName.trim()}`;
  
  return {
    success: true,
    name: fullName,
    message: `Welcome, ${fullName}! You've been added to the system.`
  };
}


/**
 * Get list of students who have signed in today
 */
function getTodayAttendance() {
  const ss = SpreadsheetApp.getActive();
  const dataSheet = ss.getSheetByName(DATASHEET);
  const lookupSheet = ss.getSheetByName(LOOKUPSHEET);
  
  const dataRange = dataSheet.getDataRange().getValues();
  const lookupData = lookupSheet.getDataRange().getValues();
  
  // Create a map of student IDs to names for faster lookup
  const studentMap = {};
  for (let i = 1; i < lookupData.length; i++) {
    if (lookupData[i][0]) {
      const id = lookupData[i][0].toString();
      const firstName = lookupData[i][1] || "";
      const lastName = lookupData[i][2] || "";
      studentMap[id] = `${firstName} ${lastName}`.trim();
    }
  }
  
  // Get today's date at midnight for comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayAttendance = [];
  
  // Skip header row, iterate through attendance records
  for (let i = 1; i < dataRange.length; i++) {
    const timestamp = new Date(dataRange[i][0]);
    timestamp.setHours(0, 0, 0, 0);
    
    // Check if record is from today
    if (timestamp.getTime() === today.getTime()) {
      const studentId = dataRange[i][1].toString();
      const studentName = studentMap[studentId] || "Unknown";
      const timeString = new Date(dataRange[i][0]).toLocaleTimeString();
      
      todayAttendance.push({
        name: studentName,
        time: timeString,
        id: studentId
      });
    }
  }
  
  return todayAttendance;
}


/**
 * INCLUDE HTML PARTS, EG. JAVASCRIPT, CSS, OTHER HTML FILES
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
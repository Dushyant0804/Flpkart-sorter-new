const alarmDictionary = {
  301: {
    message: "CV_-_01_E_-_STOP_PRESSED",
    cause: "CV01 OP1 EMERGENCY ACTIVATED",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  302: {
    message: "CV_-_02_E_-_STOP_PRESSED",
    cause: "CV02 OP2 EMERGENCY ACTIVATED",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  303: {
    message: "CV_-_01_EXIT_SENSOR_JAM",
    cause: "1.SENSOR POSITION MISSALIGNED 2.SHIPMENT IN FRONT OF THE SENSOR FOR 5MIN.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  304: {
    message: "CVW_ENTRY_SENSOR_JAM",
    cause: "1.SENSOR POSITION MISSALIGNED 2.THE SENSOR MUST BE SENSING THE CONVEYOR BELT FOR 5SEC. 3.SHIPMENT POSSIBLY STUCK IN FRONT OF THE SENSOR FOR 5SEC.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  305: {
    message: "CVW_EXIT_SENSOR_JAM",
    cause: "1.SENSOR POSITION MISSALIGNED 2.THE SENSOR MUST BE SENSING THE CONVEYOR BELT FOR 5SEC. 3.SHIPMENT POSSIBLY STUCK IN FRONT OF THE SENSOR FOR 5SEC.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  306: {
    message: "CV02_ENTRY_SENSOR_JAM",
    cause: "1.SENSOR POSITION MISSALIGNED 2.THE SENSOR MUST BE SENSING THE CONVEYOR BELT FOR 5SEC. 3.SHIPMENT POSSIBLY STUCK IN FRONT OF THE SENSOR FOR 5SEC.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  307: {
    message: "CV02_EXIT_SENSOR_JAM",
    cause: "1.SENSOR POSITION MISSALIGNED 2.THE SENSOR MUST BE SENSING THE CONVEYOR BELT FOR 5SEC. 3.SHIPMENT POSSIBLY STUCK IN FRONT OF THE SENSOR FOR 5SEC.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  308: {
    message: "CV_-_03_FULL",
    cause: "1.WHEN GRC FULL SENSOR JAM FOR 5SEC.2.SHIPMENT PRESENT IN FRONT OF GRC SENSOR. 3.GRC SENSOR MISALIGNED .",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  309: {
    message: "DIMENSIONING_SCANNER_DISCONNECTED",
    cause: "DIMENSION CAMERA COMMUNICATION NOT HEALTHY",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  310: {
    message: "DIMENSION_SCANNER_NOT_READY",
    cause: "1.DIMENSION CAMERA OFFLINE 2.CAMERA CABLE DISCONNECTED.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  311: {
    message: "WEIGHING_INDICATOR_DISCONNECTED",
    cause: "1.WEIGHING COMMUNICATION NOT HEALTHY",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  312: {
    message: "HANDHELD_BARCODE_SCANNER_DISCONNECTED",
    cause: ".HANDHELD SCANNER USB IS NOT PROPERLY CONNECTED TO THE HMI AND WILL DISCONNECT.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  313: {
    message: "INVALID_BARCODE_SCANNED,_PLEASE_SCAN_VALID_BARCODE",
    cause: "BARCODE IS INVALID(BARCODE REJEX DID NOT MATCH).",
    machine_status: "RUNNING",
    Remarks: "AUTORESET"
  },
  314: {
    message: "DEFINED_PARAMETERS_BREACHED,_PLEASE_PICK_PARCEL_FROM_CV_-_02",
    cause: "DIMENSIONS OR WEIGHT IS OVER OR UNDER LIMIT",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  315: {
    message: "PLC_SERVER_COMMUNICATION",
    cause: "SERVER-PLC COMMUNICATION DOWN 1.SERVER CABLE DISCONNECT 2- SERVER SHUTDOWN",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  316: {
    message: "1st_VALIDATION_NOT_ACKNOWLEDGED,_PLEASE_RESCAN_PARCEL",
    cause: " If the scanner barcode doesn't reached the PLC/Server, then we will get this alarm",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  317: {
    message: "2ND_VALIDATION_NOT_ACKNOWLEDGED,_PLEASE_REPROCESS_PARCEL",
    cause: "If the Dimension/Weight data doesn't reached the PLC/Server, then we will get this alarm",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  318: {
    message: "CV_-_01_DRIVE_FAULT",
    cause: "MAIN PANEL DRIVE 1 IN FAULT 1- ETHERNET CABLE DISCONNECTED",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  319: {
    message: "CV_-_W_DRIVE_FAULT",
    cause: "MAIN PANEL DRIVE 1 IN FAULT 1- ETHERNET CABLE DISCONNECTED",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  320: {
    message: "CV_-_02_DRIVE_FAULT",
    cause: "MAIN PANEL DRIVE 1 IN FAULT 1- ETHERNET CABLE DISCONNECTED",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  321: {
    message: "START_PB_LONG_PRESS",
    cause: "1.START PB WIRE BREAK/ LOOSE CONNECTION 2.WHEN START PRESS FOR 5SEC.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  322: {
    message: "STOP_PB_LONG_PRESS",
    cause: "STOP PB WIRE BREAK/ LOOSE CONNECTION 2.WHEN STOP PRESS FOR 5SEC.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  323: {
    message: "CV_-_01_RESET_PB_LONG_PRESS",
    cause: "1.CV01 RESET PB WIRE BREAK/ LOOSE CONNECTION 2.WHEN RESET PB PRESS FOR 5 SEC.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  324: {
    message: "CV_-_02_RESET_PB_LONG_PRESS",
    cause: ". CV01 RESET PB WIRE BREAK/ LOOSE CONNECTION 2.WHEN RESET PRESS FOR 5 SEC. ",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  325: {
    message: "PARCEL_PICKED_FROM_CV_-_01",
    cause: "IF THE BARCODE HAS BEEN SCANNED AND IS PICKED, THIS MEAN WEIGHT INFEED SENSOR DIDN'T TRIGGERED WITHIN 1sec ",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  326: {
    message: "PARCEL_PASSED_WITHOUT_SCANNING_FROM_CV_01",
    cause: "IF THE BARCODE IS NOT SCANNED AND THE SHIPMENT IS DIRECTLY PUSHED TO CVW.",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  327: {
    message: "POWER_SAVING_MODE_ON",
    cause: "IF MAHCINE IS NOT IN USE FOR CONTINOUS 5 MINS - MACHINE SHOULD STOP",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  328: {
    message: "LENGTH_OVER_DEFINED_PARAMETER",
    cause: "SHIPMENT LENGTH EXCEEDING THE ACCEPTABLE SET LIMIT 1- OVER LENGTH SHIPMENT.",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  329: {
    message: "WIDTH_OVER_DEFINED_PARAMETER",
    cause: "SHIPMENT WIDTH EXCEEDING THE ACCEPTABLE SET LIMIT 1- OVER WIDTH SHIPMENT.",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  330: {
    message: "HEIGHT_OVER_DEFINED_PARAMETER",
    cause: "SHIPMENT HEIGTH EXCEEDING THE ACCEPTABLE SET LIMIT 1- OVER HEIGHT SHIPMENT.",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  331: {
    message: "WEIGHT_OVER_DEFINED_PARAMETER",
    cause: "SHIPMENT WEIGTH EXCEEDING THE ACCEPTABLE SET LIMIT 1- OVER WEIGHT SHIPMENT.",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  332: {
    message: "LENGTH_UNDER_DEFINED_PARAMETER",
    cause: "SHIPMENT LENGTH BELOW THE MINIMUM ACCEPTABLE SET LIMIT 1- UNDER LENGTH SHIPMENT.",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  333: {
    message: "WIDTH_UNDER_DEFINED_PARAMETER",
    cause: "SHIPMENT WIDTH BELOW THE MINIMUM ACCEPTABLE SET LIMIT 1- UNDER WIDTH SHIPMENT.",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  334: {
    message: "HEIGHT_UNDER_DEFINED_PARAMETER",
    cause: "SHIPMENT HEIGHT BELOW THE MINIMUM ACCEPTABLE SET LIMIT 1- UNDER HEIGHT SHIPMENT. ",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  335: {
    message: "WEIGHT_UNDER_DEFINED_PARAMETER",
    cause: "SHIPMENT WEIGHT BELOW THE MINIMUM ACCEPTABLE SET LIMIT",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  336: {
    message: "PLEASE_PROCESS_CALIBRATION_BOX",
    cause: "HE SHIPMENTS WHICH ARE PROCESSED BEFORE THIS ALARM SHOULD BE PROCESSED WITHOUT FAIL",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  337: {
    message: "CALIBRATION_BOX_VERIFIED_SUCCESSFULLY",
    cause: "CALIBRATION BOX RECEIVED DIMENSION AND WEIGHT ARE WITHIN TOLERANCE OF DEFINED DIMENSION AND WEIGHT",
    machine_status: "FALSE",
    Remarks: "AUTORESET"
  },
  338: {
    message: "CALIBRATION_BOX_VERIFICATION_FAILED",
    cause: "CALIBRATION BOX RECEIVED DIMENSION AND WEIGHT ARE NOT WITHIN TOLERANCE OF DEFINED DIMENSION AND WEIGHT",
    machine_status: "FALSE",
    Remarks: "Hard check enabled"
  },
  339: {
    message: "NO_DIMENSION_RECEIVED",
    cause: "DIMENSIONS NOT RECEIVED FROM PLC WITHIN SET TIMEOUT",
    machine_status: "FALSE",
    Remarks: "Hard check enabled"
  },
  340: {
    message: "NO_WEIGHT_RECEIVED",
    cause: "WEIGHT IS NOT RECEIVED FROM PLC WITHIN SET TIMEOUT",
    machine_status: "FALSE",
    Remarks: "Hard check enabled"
  },
  341: {
    message: "SAME_BARCODE_RECEIVED_REJECTION",
    cause: "SAME BARCODE RECEIVED FOR LAST NUMBER OF SHIPMENT, NUMBER/COUNT IS SET IN IT.",
    machine_status: "FALSE",
    Remarks: "Hard check enabled"
  },
  342: {
    message: "SAME_DIMENSION_RECEIVED_REJECTION",
    cause: "SAME DIMENSIONS RECEIVED FOR LAST NUMBER OF PARCELS, NUMBER/COUNT IS SET IN IT. Count - 5",
    machine_status: "FALSE",
    Remarks: "Calibration Alarm"
  },
  343: {
    message: "SAME_WEIGHT_RECEIVED_REJECTION",
    cause: "SAME WEIGHT RECEIVED FOR LAST NUMBER OF PARCELS, NUMBER/COUNT IS SET IN IT Count - 5",
    machine_status: "FALSE",
    Remarks: "Calibration Alarm"
  },
  344: {
    message: "MULTIPLE_PARCELS_FOUND_ON_CV_-_W",
    cause: "TWO SHIPMENT DETECT ON CONVEYOR 2.RECEIVED BOX COUNT OF THE PARCEL FROM DIMENSION CAMERA IS GREATER THAN 1.",
    machine_status: "FALSE",
    Remarks: "Hard check enabled"
  },
  345: {
    message: "INTERNET_CONNECTION_ERROR",
    cause: "1.CLIENT INTERNET DOWN 2. INTERNET CABLE DISCONNECT",
    machine_status: "FALSE",
    Remarks: "Hard check enabled"
  },
  346: {
    message: "ZERO_DIMENSIONS_RECEIVED",
    cause: "ZERO DIMENSION RECEIVED FROM PLC TO Mechint",
    machine_status: "FALSE",
    Remarks: "Calibration Alarm"
  },
  347: {
    message: "ZERO_WEIGHT_RECEIVED",
    cause: "ZERO WEIGHT RECEIVED FROM PLC ",
    machine_status: "FALSE",
    Remarks: "Calibration Alarm"
  },
  348: {
    message: "NEGATIVE_DIMENSIONS_RECEIVED",
    cause: "NEGATIVE DIMENSION RECEIVED FROM PLC",
    machine_status: "FALSE",
    Remarks: "Calibration Alarm"
  },
  349: {
    message: "FTP_FOLDER_UNAVAILABLE",
    cause: "IMAGE NOT SELECTED FOR THAT SHIPEMENT OR IMAGE IS NOT TRANSFERRED IN FTP.",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  350: {
    message: "REAL_VOLUME_IS_GREATER_THAN_BOX_VOLUME",
    cause: "GETTING REAL VOLUME GREATER THAN VOLUME FROM DIMENSION CAMERA",
    machine_status: "N/A",
    Remarks: "Calibration Alarm"
  },
  351: {
    message: "DIMENSIONING_SCANNER_DISCONNECTED",
    cause: "DIMENSIONING_SCANNER_DISCONNECTED",
    machine_status: "FALSE",
    Remarks: "Calibration Alarm"
  },
  352: {
    message: "USER_NOT_LOGGED_IN",
    cause: "WHEN THE USER IS NOT LOGGED IN ON THE DASHBOARD.",
    machine_status: "FALSE",
    Remarks: "Hard check enabled"
  },
  353: {
    message: "BLANK_DATA_RECEIVED",
    cause: "BLANK DATA RECEIVED FROM PLC TO Software",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  354: {
    message: "Y_AXIS_NOT_HOMED",
    cause: "Y_AXIS_NOT_HOME",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  355: {
    message: "CB_Over_Length",
    cause: "spare3",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  356: {
    message: "CB_Under_Length",
    cause: "spare4",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  357: {
    message: "CB_Over_Width",
    cause: "spare5",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  358: {
    message: "CB_Under_Width",
    cause: "spare6",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  359: {
    message: "CB_Over_Height",
    cause: "spare7",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  360: {
    message: "CB_Under_Height",
    cause: "spare8",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  361: {
    message: "CB_Over_Weight",
    cause: "spare9",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  362: {
    message: "CB_Under_Weight",
    cause: "spare10",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  363: {
    message: "Main_Panel_EMG_Pressed",
    cause: "spare11",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  364: {
    message: "spare12",
    cause: "spare12",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  364: {
    message: "spare12",
    cause: "spare12",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  364: {
    message: "spare12",
    cause: "spare12",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  364: {
    message: "spare12",
    cause: "spare12",
    machine_status: "FALSE",
    Remarks: "N/A"
  },
  // 🔁 Add more codes up to 100...
};

module.exports = alarmDictionary;
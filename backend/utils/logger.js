const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const LOG_DIR = path.join("D:", "logs");
const { format } = winston;

// Filter to exclude errors from app.log
const ignoreErrors = format((info) => {
  return info.level === "error" ? false : info;
});

// Common log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),

  winston.format.printf((info) => {
    const {
      timestamp,
      level,
      message,
      event,
      stack,
      ...extraFields
    } = info;

    const log = {
      timestamp,
      level: level.toUpperCase(),
      message,
      event,
      ...extraFields,
    };

    if (stack) {
      log.stack = stack;
    }

    return JSON.stringify(log, null, 2);
  })
);

// ---------------- Main Logger ----------------

const logger = winston.createLogger({
  level: "info",
  format: logFormat,

  transports: [
    // App log (Info + Warn only)
new DailyRotateFile({
  filename: path.join(LOG_DIR, "app-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",          // last 30 days
  zippedArchive: false,
  format: winston.format.combine(
    ignoreErrors(),
    logFormat
  ),
}),

    // Error log (Only Errors)
new DailyRotateFile({
  filename: path.join(LOG_DIR, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  level: "error",
  maxFiles: "30d",
  zippedArchive: false,
})
  ],
});

// ---------------- Bag Logger ----------------

const bagLogger = winston.createLogger({
  level: "info",
  format: logFormat,

  transports: [
    // Bag logs
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "bag_logs-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      zippedArchive: false,
    }),

    // Bag errors also go to error.log
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "30d",
      zippedArchive: false,
    })
  ],
});

// ---------------- Bulk Data Logger ----------------

const bulkDataLogger = winston.createLogger({
  level: "info",
  format: logFormat,

  transports: [
    // Bulk data logs
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "bulk_data-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      zippedArchive: false,
    }),

    // Bulk data errors also go to error.log
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "30d",
      zippedArchive: false,
    }),
  ],
});

// Attach bag logger so existing code doesn't change
logger.bagLogger = bagLogger;
logger.bulkDataLogger = bulkDataLogger;

module.exports = logger;
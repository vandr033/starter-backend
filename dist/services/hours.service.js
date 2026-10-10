"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHours = getHours;
exports.updateHours = updateHours;
const HoursRepo = __importStar(require("../repositories/hours.repo"));
// Day names for response
const DAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];
/**
 * Validate time format (HH:mm)
 */
function validateTimeFormat(time) {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
}
/**
 * Get all hours for a company, creating missing days if needed
 */
async function getHours(companyId) {
    try {
        // Create missing days
        const createdCount = await HoursRepo.createMissingDays(companyId);
        // Get all hours
        const hours = await HoursRepo.getHoursByCompany(companyId);
        // Add day names to response
        const hoursWithNames = hours.map(h => ({
            ...h,
            day_name: DAY_NAMES[h.day_of_week],
        }));
        return {
            code: 200,
            message: 'Hours retrieved successfully',
            error: false,
            data: {
                hours: hoursWithNames,
                created_missing_days: createdCount,
            },
        };
    }
    catch (error) {
        console.error('Error getting hours:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}
async function updateHours(companyId, input) {
    try {
        // Validate input
        if (!input.hours || !Array.isArray(input.hours)) {
            return {
                code: 400,
                message: 'hours must be an array',
                error: true,
            };
        }
        // Validate each hour entry
        for (const hour of input.hours) {
            // Validate day_of_week
            if (typeof hour.day_of_week !== 'number' || hour.day_of_week < 0 || hour.day_of_week > 6) {
                return {
                    code: 400,
                    message: `Invalid day_of_week: ${hour.day_of_week}. Must be between 0 and 6.`,
                    error: true,
                };
            }
            // Validate is_closed
            if (typeof hour.is_closed !== 'boolean') {
                return {
                    code: 400,
                    message: `is_closed must be a boolean for day ${hour.day_of_week}`,
                    error: true,
                };
            }
            // If not closed, validate times
            if (!hour.is_closed) {
                if (!hour.open_time) {
                    return {
                        code: 400,
                        message: `open_time is required when is_closed is false for day ${hour.day_of_week}`,
                        error: true,
                    };
                }
                if (!hour.close_time) {
                    return {
                        code: 400,
                        message: `close_time is required when is_closed is false for day ${hour.day_of_week}`,
                        error: true,
                    };
                }
                if (!validateTimeFormat(hour.open_time)) {
                    return {
                        code: 400,
                        message: `Invalid open_time format: ${hour.open_time}. Must be HH:mm (24-hour format).`,
                        error: true,
                    };
                }
                if (!validateTimeFormat(hour.close_time)) {
                    return {
                        code: 400,
                        message: `Invalid close_time format: ${hour.close_time}. Must be HH:mm (24-hour format).`,
                        error: true,
                    };
                }
                // Validate that close_time is after open_time
                const openMinutes = parseInt(hour.open_time.split(':')[0]) * 60 + parseInt(hour.open_time.split(':')[1]);
                const closeMinutes = parseInt(hour.close_time.split(':')[0]) * 60 + parseInt(hour.close_time.split(':')[1]);
                if (closeMinutes <= openMinutes) {
                    return {
                        code: 400,
                        message: `close_time must be after open_time for day ${hour.day_of_week}`,
                        error: true,
                    };
                }
            }
        }
        // Check for overlapping time slots within the same day
        const hoursByDay = input.hours.reduce((acc, hour) => {
            if (!acc[hour.day_of_week]) {
                acc[hour.day_of_week] = [];
            }
            acc[hour.day_of_week].push(hour);
            return acc;
        }, {});
        for (const [dayOfWeek, dayHours] of Object.entries(hoursByDay)) {
            // Skip checking if only one slot for this day
            if (dayHours.length <= 1)
                continue;
            // Filter out closed slots and check for overlaps
            const openSlots = dayHours.filter(h => !h.is_closed);
            for (let i = 0; i < openSlots.length; i++) {
                for (let j = i + 1; j < openSlots.length; j++) {
                    const slot1 = openSlots[i];
                    const slot2 = openSlots[j];
                    // Convert times to minutes for comparison
                    const slot1Start = parseInt(slot1.open_time.split(':')[0]) * 60 + parseInt(slot1.open_time.split(':')[1]);
                    const slot1End = parseInt(slot1.close_time.split(':')[0]) * 60 + parseInt(slot1.close_time.split(':')[1]);
                    const slot2Start = parseInt(slot2.open_time.split(':')[0]) * 60 + parseInt(slot2.open_time.split(':')[1]);
                    const slot2End = parseInt(slot2.close_time.split(':')[0]) * 60 + parseInt(slot2.close_time.split(':')[1]);
                    // Check if slots overlap
                    if ((slot1Start < slot2End && slot1End > slot2Start) ||
                        (slot2Start < slot1End && slot2End > slot1Start)) {
                        return {
                            code: 400,
                            message: `Overlapping time slots found for day ${dayOfWeek}. Please ensure time slots don't overlap.`,
                            error: true,
                        };
                    }
                }
            }
        }
        // Get all unique days
        const days = new Set(input.hours.map(h => h.day_of_week));
        // Add missing days as closed (12:00 AM to 12:00 AM)
        const allDays = [0, 1, 2, 3, 4, 5, 6];
        const missingDays = allDays.filter(day => !days.has(day));
        if (missingDays.length > 0) {
            // Add missing days as closed
            const closedHours = missingDays.map(day => ({
                day_of_week: day,
                open_time: undefined,
                close_time: undefined,
                is_closed: true
            }));
            input.hours.push(...closedHours);
        }
        // Perform batch update (replace all hours)
        await HoursRepo.replaceAllHours(companyId, input.hours);
        // Get updated hours
        const updatedHours = await HoursRepo.getHoursByCompany(companyId);
        const hoursWithNames = updatedHours.map(h => ({
            ...h,
            day_name: DAY_NAMES[h.day_of_week],
        }));
        return {
            code: 200,
            message: 'Hours updated successfully',
            error: false,
            data: hoursWithNames,
        };
    }
    catch (error) {
        console.error('Error updating hours:', error);
        return {
            code: 500,
            message: 'Internal server error',
            error: true,
            technicalMessage: error.toString(),
        };
    }
}

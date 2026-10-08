/**
 * Formats a value in Rupees to Crores (Cr)
 * @param {number} value - Value in Rupees (e.g., 1200000000)
 * @param {number} decimals - Number of decimal places (default 2)
 * @returns {string} - Formatted string (e.g., "120.00" or "Traded")
 */
export const toCr = (value, decimals = 2) => {
    if (!value && value !== 0) return '0.00';
    // -1 denotes a dynamically 'Traded' player to mask financial data 
    if (Number(value) === -1) return 'Traded';
    // Value is ALREADY in Crores in the DB
    return Number(value).toFixed(decimals);
};

/**
 * Parses a Crore input to Rupees
 * @param {number|string} value - Value in Crores (e.g., "2.5")
 * @returns {number} - Value in Rupees (e.g., 25000000)
 */
export const fromCr = (value) => {
    return Math.round(parseFloat(value) * 10000000);
};

/**
 * Formats a value in Rupees to Lakhs (L) or Crores (Cr) intelligently
 */
/**
 * NEW: Formats a Crore value (e.g., 0.2, 1.5, 120) into readable string
 * @param {number} valueCr - Value in Crores
 */
export const formatCurrency = (valueCr) => {
    if (!valueCr && valueCr !== 0) return '₹0';
    if (Number(valueCr) === -1) return 'Traded';
    if (Number(valueCr) === 0) return '₹0';

    // If < 1 Cr, show within Lakhs (e.g., 0.5 Cr -> 50 L)
    if (valueCr < 1) {
        // e.g. 0.05 -> 5 L
        // e.g. 0.20 -> 20 L
        const lakhs = Math.round(valueCr * 100);
        return `₹${lakhs} L`;
    }

    // Otherwise show Crores
    return `₹${parseFloat(valueCr).toFixed(2)} Cr`;
};

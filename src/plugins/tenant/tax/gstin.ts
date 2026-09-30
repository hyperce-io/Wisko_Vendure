/**
 * Indian GSTIN checks for the Order.gstin custom field. The same rules as ERP's
 * wisko.tax.india_gst.gstin_error, which checks the value again when the order arrives.
 */

// GST state codes (first two GSTIN digits). 25 and 28 are no longer issued: those regions now
// use 26 and 37.
const GST_STATE_CODES = new Set([
    '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16',
    '17', '18', '19', '20', '21', '22', '23', '24', '26', '27', '29', '30', '31', '32', '33', '34',
    '35', '36', '37', '38', '97',
]);

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The 15th GSTIN character: a mod-36 checksum over the first 14, weighting every second one by 2. */
function gstinCheckCharacter(first14: string): string {
    let total = 0;
    [...first14].forEach((character, index) => {
        const product = GSTIN_CHARSET.indexOf(character) * (index % 2 ? 2 : 1);
        total += Math.floor(product / 36) + (product % 36);
    });
    return GSTIN_CHARSET[(36 - (total % 36)) % 36];
}

/** Why `gstin` is not a valid GSTIN, or undefined when it is. */
export function gstinError(gstin: string): string | undefined {
    if (!GSTIN_PATTERN.test(gstin)) {
        return 'GSTIN must be 15 characters in capitals, e.g. 27AAPFU0939F1ZV';
    }
    if (!GST_STATE_CODES.has(gstin.slice(0, 2))) {
        return `GSTIN starts with ${gstin.slice(0, 2)}, which is not a GST state code`;
    }
    if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) {
        return 'GSTIN has the wrong check character; please check it for typos';
    }
    return undefined;
}

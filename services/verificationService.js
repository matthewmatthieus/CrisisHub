/**
 * Calculate Community Confidence Score
 * Formula:
 * Confirm / (Confirm + Dispute) × 100
 */
function calculateConfidence(confirmCount, disputeCount) {

    const totalVotes = confirmCount + disputeCount;

    if (totalVotes === 0) {
        return 0;
    }

    return Number(((confirmCount / totalVotes) * 100).toFixed(2));
}

/**
 * Convert severity into a numeric weight
 */
function getSeverityWeight(severity) {

    switch (severity.toLowerCase()) {

        case "critical":
            return 4;

        case "high":
            return 3;

        case "medium":
            return 2;

        case "low":
            return 1;

        default:
            return 1;
    }

}

/**
 * Calculate Priority Score
 */
function calculatePriority(severity, confidence) {

    const weight = getSeverityWeight(severity);

    return Number((weight * confidence).toFixed(2));

}

/**
 * Determine Priority Level
 */
function getPriorityLevel(score) {

    if (score >= 300) return "CRITICAL";

    if (score >= 200) return "HIGH";

    if (score >= 100) return "MEDIUM";

    return "LOW";

}

module.exports = {

    calculateConfidence,

    calculatePriority,

    getPriorityLevel

};
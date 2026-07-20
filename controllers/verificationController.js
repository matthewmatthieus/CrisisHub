const verificationService = require("../services/verificationService");

// Display Verification Page
exports.index = async (req, res) => {

    try {

        // Temporary mock data
        const incidents = [
            {
                incident_id: 1,
                title: "Fallen Tree at Jurong West",
                severity: "High",
                confirmCount: 18,
                disputeCount: 2
            },
            {
                incident_id: 2,
                title: "Streetlight Not Working",
                severity: "Medium",
                confirmCount: 7,
                disputeCount: 3
            }
        ];

        const results = incidents.map(incident => {

            const confidence = verificationService.calculateConfidence(
                incident.confirmCount,
                incident.disputeCount
            );

            const priorityScore = verificationService.calculatePriority(
                incident.severity,
                confidence
            );

            const priorityLevel = verificationService.getPriorityLevel(
                priorityScore
            );

            return {
                ...incident,
                confidence,
                priorityScore,
                priorityLevel
            };

        });

        res.render("verification/index", {
            incidents: results
        });

    } catch (err) {

        console.error(err);

        res.status(500).send("Server Error");

    }

};
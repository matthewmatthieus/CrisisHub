const nodemailer = require('nodemailer');

const incidentStatusContent = {
    received: ['Your incident report has been received', 'Your report has been submitted successfully and is awaiting review.'],
    under_review: ['Your incident report is under review', 'The CrisisHub team is currently reviewing your report.'],
    verified: ['Your incident report has been verified', 'Your report has been reviewed and verified.'],
    more_information_required: ['More information is required for your report', 'An administrator needs additional information before your report can be verified.'],
    resolved: ['Your incident report has been resolved', 'Your incident report has been marked as resolved.'],
    rejected: ['Update regarding your incident report', 'Your report could not be verified. Open CrisisHub to review the update.']
};
const helpRequestContent = {
    accepted: ['Your help request has been accepted', 'Someone has accepted your help request. Open CrisisHub to view the latest update.'],
    new_response: ['You received a response to your help request', 'A new response has been added to your help request.'],
    urgency_changed: ['Your help-request urgency was updated', 'The urgency level of your help request has changed.'],
    more_information_required: ['More information is required', 'An administrator needs more information about your help request.'],
    closed: ['Your help request has been closed', 'Your help request has been marked as closed.'],
    cancelled: ['Your help request was cancelled', 'Your help request has been cancelled.']
};
const adminAlertContent = {
    high_priority_incident: ['[Urgent] High-priority incident submitted', 'A high-priority incident requires administrator review.'],
    multiple_nearby_reports: ['Multiple reports detected in one area', 'Several reports may relate to the same location or event.'],
    incident_awaiting_verification: ['Incident awaiting verification', 'An incident has remained unverified beyond the review period.'],
    possible_abuse: ['Potential abusive or false report detected', 'A report has been flagged for administrator investigation.'],
    resource_supply_low: ['Resource supply is running low', 'A resource has reached its configured low-stock threshold.']
};

function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
let transporter;

function getTransporter() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD are not configured.');
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });
    }

    return transporter;
}
async function sendEmail({ to, subject, html }) {
    return getTransporter().sendMail({
        from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
        to,
        subject,
        html
    });
}
function actionEmail({ email, name, subject, message, buttonText, url }) {
    return sendEmail({
        to: email,
        subject,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px"><h2>${escapeHtml(subject)}</h2><p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px">${escapeHtml(buttonText)}</a></p><p>CrisisHub Team</p></div>`
    });
}
async function sendVerificationEmail({ email, name, verificationUrl }) {
    return actionEmail({ email, name, subject: 'Verify your CrisisHub email', message: 'Please verify your email address to activate your CrisisHub account.', buttonText: 'Verify email', url: verificationUrl });
}
async function sendRegistrationThanksEmail({ email, name, verificationUrl }) {
    return actionEmail({ email, name, subject: 'Thanks for joining CrisisHub', message: 'Thanks for creating a CrisisHub account. Verify your email to activate your account and start helping your community.', buttonText: 'Verify my email', url: verificationUrl });
}
async function sendWelcomeEmail({ email, name }) {
    return actionEmail({ email, name, subject: 'Welcome to CrisisHub', message: 'Your CrisisHub account has been verified successfully. You can now report incidents, request help, access community resources and follow verified community updates.', buttonText: 'Open CrisisHub', url: process.env.APP_URL || 'http://localhost:3000' });
}
async function sendProductBriefEmail({ email, name }) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    return sendEmail({
        to: email,
        subject: 'How CrisisHub helps your community',
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;max-width:620px;color:#172033">
            <h2>How CrisisHub works</h2>
            <p>Hi ${escapeHtml(name)},</p>
            <p>CrisisHub connects community reports, help requests, and available resources in one place.</p>
            <h3>What you can do</h3>
            <ul>
                <li><strong>Report incidents:</strong> share what happened and where it happened.</li>
                <li><strong>Request help:</strong> describe what you need so the community can respond.</li>
                <li><strong>Offer resources:</strong> list supplies, transport, shelter, or other support.</li>
                <li><strong>Use the response map:</strong> view incidents, requests, and resources by location.</li>
                <li><strong>Follow updates:</strong> receive email notifications when relevant reports change.</li>
            </ul>
            <p><a href="${escapeHtml(appUrl)}" style="display:inline-block;padding:12px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px">Open CrisisHub</a></p>
            <p>CrisisHub Team</p>
        </div>`
    });
}
async function sendPasswordResetEmail({ email, name, resetUrl }) {
    return actionEmail({ email, name, subject: 'Reset your CrisisHub password', message: 'A password reset was requested for your account. This link expires in 30 minutes and can only be used once.', buttonText: 'Reset password', url: resetUrl });
}
async function sendIncidentStatusEmail({ email, name, incidentId, status }) {
    const content = incidentStatusContent[status];
    if (!content) throw new Error(`Unsupported incident status: ${status}`);
    return actionEmail({ email, name, subject: content[0], message: content[1], buttonText: 'View incident', url: `${process.env.APP_URL || 'http://localhost:3000'}/incidents/${incidentId}` });
}
async function sendHelpRequestUpdateEmail({ email, name, helpRequestId, eventType }) {
    const content = helpRequestContent[eventType];
    if (!content) throw new Error(`Unsupported help-request event: ${eventType}`);
    return actionEmail({ email, name, subject: content[0], message: content[1], buttonText: 'View help request', url: `${process.env.APP_URL || 'http://localhost:3000'}/helpRequests/${helpRequestId}` });
}
async function sendAdminAlertEmail({ adminEmails, alertType }) {
    const content = adminAlertContent[alertType];
    if (!content) throw new Error(`Unsupported admin alert: ${alertType}`);
    return sendEmail({ to: adminEmails, subject: content[0], html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>${escapeHtml(content[0])}</h2><p>${escapeHtml(content[1])}</p><p><a href="${escapeHtml(process.env.APP_URL || 'http://localhost:3000')}">Open CrisisHub</a></p></div>` });
}

module.exports = { sendVerificationEmail, sendRegistrationThanksEmail, sendWelcomeEmail, sendProductBriefEmail, sendPasswordResetEmail, sendIncidentStatusEmail, sendHelpRequestUpdateEmail, sendAdminAlertEmail };

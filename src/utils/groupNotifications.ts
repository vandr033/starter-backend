export function buildWaitlistSpotOpenedTemplate(input: {
    eventTitle: string;
    companyName: string;
    eventStartAt: Date;
    bookingUrl?: string | null;
}) {
    const when = input.eventStartAt.toISOString();
    const subject = `A spot opened for ${input.eventTitle}`;
    const text = [
        `Good news: a spot just opened for ${input.eventTitle}.`,
        `Business: ${input.companyName}`,
        `Starts at: ${when}`,
        input.bookingUrl ? `Book now: ${input.bookingUrl}` : null,
    ]
        .filter(Boolean)
        .join('\n');

    return { subject, text };
}

export function buildGroupEventBookingConfirmedTemplate(input: {
    eventTitle: string;
    companyName: string;
    startAt: Date;
    locationText?: string | null;
}) {
    const subject = `Registration confirmed: ${input.eventTitle}`;
    const text = [
        `Your registration for ${input.eventTitle} is confirmed.`,
        `Business: ${input.companyName}`,
        `Starts at: ${input.startAt.toISOString()}`,
        input.locationText ? `Location: ${input.locationText}` : null,
    ]
        .filter(Boolean)
        .join('\n');

    return { subject, text };
}

export function buildGroupClassEnrollmentConfirmedTemplate(input: {
    classTitle: string;
    companyName: string;
    validFrom: Date;
    validUntil: Date;
}) {
    const subject = `Class pass confirmed: ${input.classTitle}`;
    const text = [
        `Your class pass for ${input.classTitle} is confirmed.`,
        `Business: ${input.companyName}`,
        `Valid from: ${input.validFrom.toISOString()}`,
        `Valid until: ${input.validUntil.toISOString()}`,
    ].join('\n');

    return { subject, text };
}

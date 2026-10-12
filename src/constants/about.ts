// Keep this content local so reading About never depends on a network request.
// Team and acknowledgments: CebSpot_Manuscript_Aligned_READY_TO_PASS_20260601-202043.docx,
// title page and ACKNOWLEDGEMENT. Individual development roles/photos are not supplied.
export interface AboutLink {
  label: string;
  url: string;
}

export const aboutContent = {
  tagline: 'Discover Cebu. Find your next spot.',
  introduction: 'CebSpot is a mobile application for discovery and leisure in Cebu City. It helps users explore local places, learn more about venues, and plan their next visit.',
  purpose: 'We created CebSpot to bring local discovery tools and venue information together, helping users make informed choices about where to go while supporting the visibility of local establishments.',
  attribution: 'CebSpot was developed as a capstone project by Bachelor of Science in Information Technology students at the University of Southern Philippines Foundation.',
  coverage: 'CebSpot focuses on Cebu City, with listed places across categories such as cafés, restaurants, outdoor spots, street food, co-working spaces, bars, and clubs. Listings are a selection of places, rather than a complete directory of every establishment.',
  reservations: 'Table reservations are available only at participating establishments, subject to table and schedule availability and each venue’s booking policies.',
  team: [
    { name: 'Clyde Hans Sadudaquil', role: 'Capstone project team' },
    { name: 'Jithrix Exiel Bolambao', role: 'Capstone project team' },
    { name: 'Ms. Cyrille Shane A. Pador', role: 'Research adviser' },
  ],
  acknowledgments: 'The team gives thanks to God Almighty; research adviser Ms. Cyrille Shane A. Pador for her guidance and feedback; the University of Southern Philippines Foundation for its academic environment and resources; the study respondents for their participation; and our families, friends, and batchmates for their support.',
  // Add only verified public contacts/policy destinations. Empty arrays render no buttons.
  supportLinks: [] as AboutLink[],
  policyLinks: [] as AboutLink[],
  releaseNotes: [] as string[],
  features: [
    { title: 'Find your next spot', body: 'Search Explore and filter places by category, distance, and rating. Browse map pins and open a place to learn more.' },
    { title: 'Get to know a venue', body: 'View available photos, venue details, and community reviews. Save spots to revisit from your Profile.' },
    { title: 'Share local discoveries', body: 'Use Share a Spot to submit a place for review. On a spot’s page, write a review, add photos, or suggest corrected details.' },
    { title: 'Plan a table reservation', body: 'At a participating venue, choose the available date, time, table, and guest details, then review the booking conditions. Free reservations do not require a deposit. Paid reservations continue to checkout using the payment options offered for that booking.' },
    { title: 'Check payment and booking status', body: 'After checkout, check Reservations for the latest booking and payment details. A payment still processing or under review needs confirmation; a checkout success message alone is not your final booking status.' },
    { title: 'Track your contributions', body: 'CebSpot Rewards shows your XP, level, badges, recent activity, and leaderboard rank.' },
  ],
  faqs: [
    { id: 'intro', question: 'What is CebSpot?', answer: 'CebSpot brings local discovery and venue information together to help you explore Cebu City and plan a visit.' },
    { id: 'coverage', question: 'Which locations does it cover?', answer: 'The app focuses on Cebu City. Available listings depend on the places currently published in CebSpot; not every establishment is listed.' },
    { id: 'account', question: 'Do I need an account?', answer: 'Yes. The current user app requires sign-in to access Explore, your Profile, and other discovery screens. Contributions and reservations are associated with your account.' },
    { id: 'location', question: 'Why does CebSpot request location access?', answer: 'Location helps center the map on your position and calculate distances to spots. Circles also uses location to show your position to circle members.' },
    { id: 'denied', question: 'What works if I deny location permission?', answer: 'You can still browse and search places and move around the map. Explore starts from a Cebu City reference point, so displayed distances are not measured from your actual position. Your current-position map control needs location access.' },
    { id: 'sharing', question: 'Can other users see my location?', answer: 'Circles can show your stored location to other circle members. Opening a circle with location access can update that shared position. Denying location permission does not remove a location already saved to your profile.' },
    { id: 'sources', question: 'Where does spot information come from?', answer: 'Listings include published venue information and community submissions reviewed by administrators. Venues can manage their information through the owner tools. Details can change, so check with the venue when planning your visit.' },
    { id: 'corrections', question: 'What if venue information is incorrect?', answer: 'Open the spot, find “Found incorrect details?”, and choose “Suggest an edit”. Select the detail, enter the correction, and submit it for admin review. You must be signed in.' },
    { id: 'contribute', question: 'How do I contribute a spot or review?', answer: 'Choose Share a Spot from Profile to submit a place for review. To leave a review or add review photos, open the place’s details and use the review form.' },
    { id: 'public', question: 'Are my reviews and photos public?', answer: 'Reviews and attached review photos appear on the spot page alongside your display name. Approved spot submissions can become public listings. Share only content you intend other users to see.' },
    ...(process.env.EXPO_PUBLIC_FACE_BLUR_API_URL ? [{ id: 'photos', question: 'How are faces handled in contribution photos?', answer: 'Spot submission and review photos are sent to a face anonymization service before upload. If that processing fails, the original photo is not uploaded. Automated processing can miss faces, so check your photos and avoid sharing sensitive images.' }] : []),
    { id: 'rewards', question: 'How do points and badges work?', answer: 'Eligible activity can earn XP and progress toward achievements. Open CebSpot Rewards from Profile to see your current level, badge requirements and progress, XP history, and leaderboard rank.' },
    { id: 'booking', question: 'How do table reservations work?', answer: 'Open a participating venue and choose an available date, schedule, and table. Enter guest details and review the booking rules. If payment is required, complete the offered checkout flow. Track the booking in Reservations.' },
    { id: 'confirmation', question: 'When is a reservation confirmed?', answer: 'Check the booking and payment statuses in Reservations. Paid bookings begin pending payment and need verified payment. Manual payment submissions may require owner review. Free bookings do not require payment. Keep the booking details for your visit.' },
    { id: 'delay', question: 'What if payment succeeds but confirmation is delayed?', answer: 'Return to the booking details and check Reservations again. Payment updates may take time to reach CebSpot. Keep your payment receipt and booking reference, and contact the venue using its listed contact details if the status remains unresolved. Avoid paying again while checking the first payment.' },
    { id: 'cancellation', question: 'How do cancellations and refunds work?', answer: 'Free reservations support cancellation and adjustment requests under the venue’s rules and availability. Paid bookings do not offer the same self-service changes. The paid booking terms state that deposits and processing fees are non-refundable and deposits may be forfeited for no-shows. Review the terms before paying and contact the venue about exceptions; refunds are not automatic.' },
  ],
};

// Only public HTTPS links or plain email addresses may be configured here.
export function isValidAboutLink(value: string) {
  if (/^mailto:[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

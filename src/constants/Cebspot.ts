import type { InformationIcon } from './informationContent';

export interface ReferencePolicyBlock {
  id: string;
  heading?: string;
  paragraphs?: string[];
  items?: string[];
  variant?: 'location' | 'statement' | 'warning' | 'services';
  email?: { label: string; url: string };
}
export interface ReferencePolicySection {
  id: string;
  icon: InformationIcon;
  title: string;
  blocks: ReferencePolicyBlock[];
}

// Supplied reference policy, preserved verbatim. This is CebSpot's
// content, not a statement of CebSpot practices. The CebSpot draft remains in privacy.ts.
export const CebspotContent = {
  title: 'Privacy Policy',
  effectiveDate: 'Effective Date: June 27, 2026',
  searchLabel: 'Search privacy topics', searchPlaceholder: 'Search privacy topics…',
  clearLabel: 'Clear search', emptyTitle: 'No matching privacy topics',
  emptyBody: 'Try another search or clear the query to read the entire policy.',
  toggleHint: 'Expand or collapse this section',
  sections: [
    { id: 'introduction', icon: 'book', title: 'Introduction', blocks: [{ id: 'intro', paragraphs: [
      'Welcome to CebSpot (“the Platform”, “we”, “our”, or “us”). We are committed to protecting your privacy and handling your information responsibly. This Privacy Policy explains what information we collect, how we use it, and the choices available to you when using our Android application.',
      'By accessing or using CebSpot, you agree to the practices described in this Privacy Policy.',
    ] }] },
    { id: 'information', icon: 'database', title: 'Information We Collect', blocks: [
      { id: 'provided', heading: 'INFORMATION YOU PROVIDE', items: ['Name and profile information', 'Email address', 'Reviews, ratings, comments, and feedback', 'Information submitted through forms, inquiries, or support requests', 'Café information submitted by café owners and administrators'] },
      { id: 'automatic', heading: 'AUTOMATICALLY COLLECTED INFORMATION', items: ['Device information (device type, OS)', 'IP address', 'General usage information and activity within the Platform', 'Diagnostic and performance information', 'Analytics and crash reports'] },
      { id: 'location', heading: 'LOCATION INFORMATION', variant: 'location', paragraphs: ['CebSpot is a location-based platform. To provide its core features, the Platform requires access to your device’s location.'], items: ['Show nearby spots', 'Recommend spots based on proximity', 'Improve search and discovery experiences', 'Deliver location-aware recommendations'] },
      { id: 'location-note', paragraphs: ['* Note: Certain core features may not function properly if location permissions are denied.'] },
    ] },
    { id: 'use', icon: 'settings', title: 'How We Use Information', blocks: [{ id: 'uses', paragraphs: ['We use collected information to:'], items: ['Provide and maintain the Platform and its features', 'Personalize recommendations and search results', 'Help users discover spots based on preferences', 'Improve user experience and platform performance', 'Monitor security, reliability, and system health', 'Respond to inquiries and provide support', 'Communicate important platform updates', 'Conduct analytics and research to improve services'] }] },
    { id: 'sharing', icon: 'users', title: 'Information Sharing and Disclosure', blocks: [
      { id: 'no-sale', variant: 'statement', paragraphs: ['We do NOT sell your personal information.'] },
      { id: 'disclosure', paragraphs: ['We may share information in the following situations:'], items: ['With service providers that help operate the Platform (hosting, analytics, mapping, auth, and infrastructure)', 'With spot owners or administrators when necessary to provide Platform functionality', 'When required by law, legal process, or official government requests', 'To protect the rights, property, safety, and security of our users and the Platform'] },
    ] },
    { id: 'services', icon: 'server', title: 'Third-Party Services', blocks: [
      { id: 'intro', paragraphs: ['CebSpot uses third-party services and technologies to deliver features and improve experience. These services process data according to their own privacy policies:'] },
      { id: 'categories', variant: 'services', items: ['Cloud Hosting', 'Analytics Services', 'Database and Authentication Providers', 'Mapping APIs', 'Data Privacy', 'Storage Servers', 'Payment Gateways' ] },
      { id: 'review', paragraphs: ['We encourage users to review the privacy practices of these third-party providers.'] },
    ] },

    { id: 'service', icon: 'payment', title: 'Reservation and Payment', blocks: [
      { id: 'intro', paragraphs: ['Reservation information is used to manage the selected booking and communicate its status. Payment-related records are used to associate transactions with reservations and support payment reconciliation. Cancellation and refund rules are provided through the relevant reservation or payment information. This privacy policy does not create a refund guarantee'] },
      ] },

    { id: 'content', icon: 'edit', title: 'User-Generated Content', blocks: [
      { id: 'intro', paragraphs: ['The Platform allows you to submit user-generated content, including spot submissions, reviews, ratings, comments, photos, and feedback.'] },
      { id: 'warning', variant: 'warning', paragraphs: ['Important Warning: Any content you submit may be visible to other users. Please avoid sharing sensitive or confidential information in public fields.'] },
    ] },
    { id: 'retention', icon: 'clock', title: 'Data Retention', blocks: [{ id: 'retention', paragraphs: ['We retain information only for as long as necessary to provide the services, resolve disputes, enforce agreements, and maintain security. Once no longer needed, data is deleted, anonymized, or aggregated.'] }] },
    { id: 'security', icon: 'shield', title: 'Data Security', blocks: [{ id: 'security', paragraphs: ['We implement administrative, technical, and organizational safeguards designed to protect your information from unauthorized access, loss, or alteration.', 'In accordance with the Data Privacy Act, any form of data involving faces is automatically blurred', '* While we strive to protect your data, no method of transmission over the internet can be guaranteed 100% secure.'] }] },
    { id: 'children', icon: 'users', title: 'Children’s Privacy', blocks: [{ id: 'children', paragraphs: ['CebSpot is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If discovered, we will take steps to remove such records immediately.'] }] },
    { id: 'changes', icon: 'edit', title: 'Changes to This Privacy Policy', blocks: [{ id: 'changes', paragraphs: ['We may update this Privacy Policy from time to time. Any changes will become effective once the updated policy is posted on this page. We encourage you to review it periodically.'] }] },
    { id: 'contact', icon: 'mail', title: 'Contact Us', blocks: [
      { id: 'contact', paragraphs: ['If you have questions, concerns, or requests regarding this Privacy Policy, please contact the developer:', 'Jithrix Exiel Bolambao', 'Developer, CebSpot'], email: { label: 'Email: jithrixexiel2@gmail.com', url: 'mailto:jithrixexiel2@gmail.com' } },
      { id: 'clyde', paragraphs: ['Clyde Hans Sadudaquil', 'Developer, CebSpot'], email: { label: 'Email: clyde6@gmail.com', url: 'mailto:0clyde6@gmail.com' } },
      { id: 'thanks', paragraphs: ['Thank you for using CebSpot!.'] },
    ] },
  ] as ReferencePolicySection[],
};

export function referencePolicySearchText(section: ReferencePolicySection): string {
  return [section.title, ...section.blocks.flatMap(block => [block.heading ?? '', ...(block.paragraphs ?? []), ...(block.items ?? []), block.email?.label ?? ''])].join(' ').toLocaleLowerCase();
}

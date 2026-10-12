import type { AboutLink } from './about';

// Plain content only: rewrite sections without changing native layouts.
export type InformationIcon = 'book' | 'map' | 'search' | 'users' | 'database' | 'shield' | 'image' | 'bell' | 'payment' | 'phone' | 'server' | 'bookmark' | 'award' | 'calendar' | 'account' | 'edit' | 'clock' | 'mail' | 'settings';
export interface ContentBlock {
  id: string;
  heading?: string;
  paragraphs?: string[];
  items?: string[];
  numbered?: boolean;
  links?: AboutLink[];
  context?: boolean;
}
export interface ContentCard {
  id: string;
  icon: InformationIcon;
  category: string;
  title: string;
  paragraphs: string[];
  details?: ContentBlock[];
  chips?: string[];
}

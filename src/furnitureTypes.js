// Keep these keys in sync with your Google Drive subfolder names.
// Labels are user-facing.
export const FURNITURE_TYPES = [
  { key: 'DiningTable', label: 'Dining Table' },
  { key: 'DiningChair', label: 'Dining Chair' },
  { key: 'Sideboard', label: 'Sideboard' },
  { key: 'Dresser', label: 'Dresser' },
  { key: 'Cabinet', label: 'Cabinet' },
  { key: 'CoffeeTable', label: 'Coffee Table' },
  { key: 'Bed', label: 'Bed Frame' },
  { key: 'Desk', label: 'Desk' },
  { key: 'Armoire', label: 'Armoire' },
  { key: 'Hutch', label: 'Hutch' },
  { key: 'Sidetable', label: 'Side Table' },
  { key: 'Chest', label: 'Chest' },
  // Optional extra categories you have in Drive:
  { key: 'ConsoleTable', label: 'Console Table' },
  { key: 'Vanity', label: 'Vanity' }
];

export function typeLabel(key) {
  return FURNITURE_TYPES.find(t => t.key === key)?.label ?? key;
}

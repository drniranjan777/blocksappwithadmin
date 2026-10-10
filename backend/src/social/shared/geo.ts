/**
 * States and union territories, spelled one way. Content is placed on the Reach
 * Ladder by where it is from, so a free-text "state" would split one place into a
 * dozen spellings and make grouping meaningless.
 *
 * Districts are not validated against a list (there are 750+ and they change);
 * they are cleaned and length-limited like any other text.
 */
export const INDIAN_STATES: readonly string[] = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
];

const ALIASES: Record<string, string> = {
  'nct of delhi': 'Delhi',
  'new delhi': 'Delhi',
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  uttaranchal: 'Uttarakhand',
  'andaman & nicobar islands': 'Andaman and Nicobar Islands',
  'jammu & kashmir': 'Jammu and Kashmir',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

const BY_LOWER = new Map(INDIAN_STATES.map((s) => [s.toLowerCase(), s]));

/** The canonical spelling of a state or union territory, or `undefined` if it is not one. */
export function canonicalState(input: string): string | undefined {
  const key = input.trim().replace(/\s+/g, ' ').toLowerCase();
  return BY_LOWER.get(key) ?? ALIASES[key];
}

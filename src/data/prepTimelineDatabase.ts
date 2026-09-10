import { MilestoneCategory } from '../types.js';

export interface PrepTaskRule {
  id: string;
  name: string;
  category: MilestoneCategory;
  keywords: string[];
  minimumLeadDays: number;
  idealLeadDays: number;
  badge: string;
  reason: string;
  alternatives: Array<{
    amount: number;
    unit: 'weeks' | 'days' | 'hours' | 'months';
    badge: string;
    label: string;
    reason: string;
  }>;
  deliverables: Array<{
    title: string;
    type: 'booking' | 'purchase' | 'document' | 'coordination';
  }>;
}

/**
 * Curated Knowledge Base for Event Preparation Timelines
 * Backed by real-world scheduling requirements (production times, booking windows, peak seasons).
 */
export const PREP_KNOWLEDGE_DATABASE: PrepTaskRule[] = [
  // =========================================================================
  // 1. WEDDINGS & MAJOR CEREMONIES (Long Lead: 6-12 Months)
  // =========================================================================
  {
    id: 'wedding-venue',
    name: 'Book Wedding Venue & Ceremony Location',
    category: 'booking',
    keywords: ['wedding venue', 'ceremony venue', 'reception hall', 'wedding location', 'church booking'],
    minimumLeadDays: 240,
    idealLeadDays: 300,
    badge: 'T-9m',
    reason: 'Top wedding venues and Saturday dates regularly book out 9 to 12 months in advance.',
    alternatives: [
      { amount: 12, unit: 'months', badge: 'T-12m', label: '12 Months before', reason: 'High-season summer and holiday long weekends' },
      { amount: 6, unit: 'months', badge: 'T-6m', label: '6 Months before', reason: 'Off-peak winter or weekday celebrations' },
    ],
    deliverables: [
      { title: 'Signed venue agreement & deposit payment confirmation', type: 'booking' },
      { title: 'Ceremony time window & vendor access guidelines', type: 'document' },
    ],
  },
  {
    id: 'wedding-dress',
    name: 'Buy Wedding Dress / Custom Suit & Bridal Attire',
    category: 'shopping',
    keywords: [
      'wedding dress', 'bridal gown', 'wedding gown', 'bridal dress', 'buy wedding dress',
      'order wedding dress', 'custom wedding suit', 'tailored tuxedo', 'bridesmaid dresses',
      'groomsman suits', 'veil', 'bridal shop'
    ],
    minimumLeadDays: 180,
    idealLeadDays: 240,
    badge: 'T-8m',
    reason: 'Made-to-order wedding dresses and custom suits require 4 to 6 months for manufacturing and shipping, plus 6 to 8 weeks for multiple rounds of fittings and alterations.',
    alternatives: [
      { amount: 9, unit: 'months', badge: 'T-9m', label: '9 Months before', reason: 'Designer made-to-measure gowns and international boutique orders' },
      { amount: 6, unit: 'months', badge: 'T-6m', label: '6 Months before', reason: 'Standard boutique order timeline' },
      { amount: 2, unit: 'months', badge: 'T-2m', label: '2 Months before', reason: 'Off-the-rack purchases needing rush alterations only' },
    ],
    deliverables: [
      { title: 'Wedding dress or suit order receipt with delivery timeline', type: 'purchase' },
      { title: 'Fitting appointments scheduled with alteration specialist', type: 'booking' },
    ],
  },
  {
    id: 'wedding-photographer',
    name: 'Book Wedding Photographer & Videographer',
    category: 'booking',
    keywords: ['wedding photographer', 'wedding video', 'wedding videographer', 'engagement shoot'],
    minimumLeadDays: 180,
    idealLeadDays: 240,
    badge: 'T-8m',
    reason: 'Experienced wedding photographers only take one wedding per day and lock their schedules 6 to 9 months ahead.',
    alternatives: [
      { amount: 9, unit: 'months', badge: 'T-9m', label: '9 Months before', reason: 'High-demand documentary wedding photographers' },
      { amount: 4, unit: 'months', badge: 'T-4m', label: '4 Months before', reason: 'Local studio packages' },
    ],
    deliverables: [
      { title: 'Signed photography contract & shot wishlist', type: 'booking' },
      { title: 'Day-of coverage timeline & hours agreed', type: 'document' },
    ],
  },
  {
    id: 'wedding-caterer',
    name: 'Book Wedding Caterer & Schedule Menu Tasting',
    category: 'booking',
    keywords: ['wedding caterer', 'wedding catering', 'menu tasting', 'wedding tasting'],
    minimumLeadDays: 150,
    idealLeadDays: 210,
    badge: 'T-7m',
    reason: 'Securing the caterer early locks in staff, bar setup, and dietary menu planning before peak dates fill up.',
    alternatives: [
      { amount: 8, unit: 'months', badge: 'T-8m', label: '8 Months before', reason: 'Custom plated dinner tastings' },
      { amount: 4, unit: 'months', badge: 'T-4m', label: '4 Months before', reason: 'Buffet or venue-preferred catering lists' },
    ],
    deliverables: [
      { title: 'Confirmed catering deposit & initial course selection', type: 'booking' },
      { title: 'Menu tasting date booked', type: 'booking' },
    ],
  },
  {
    id: 'wedding-save-the-dates',
    name: 'Send Save the Dates',
    category: 'prep',
    keywords: ['save the date', 'save the dates', 'wedding save the date'],
    minimumLeadDays: 120,
    idealLeadDays: 180,
    badge: 'T-6m',
    reason: 'Gives out-of-town guests 6 months to book travel and request time off from work.',
    alternatives: [
      { amount: 8, unit: 'months', badge: 'T-8m', label: '8 Months before', reason: 'Destination weddings or holiday weekend dates' },
      { amount: 4, unit: 'months', badge: 'T-4m', label: '4 Months before', reason: 'Local city weddings' },
    ],
    deliverables: [
      { title: 'Save the date cards or digital links sent', type: 'coordination' },
      { title: 'Wedding website link shared with hotel recommendations', type: 'document' },
    ],
  },
  {
    id: 'wedding-fittings',
    name: 'First Dress / Suit Alteration Fitting',
    category: 'costume',
    keywords: ['dress fitting', 'suit fitting', 'alteration fitting', 'wedding dress fitting', 'hem dress'],
    minimumLeadDays: 45,
    idealLeadDays: 60,
    badge: 'T-8w',
    reason: 'Tailors need 4 to 8 weeks for detailed bust, waist, hem adjustments, and bustling.',
    alternatives: [
      { amount: 8, unit: 'weeks', badge: 'T-8w', label: '8 Weeks before', reason: 'First major fitting' },
      { amount: 3, unit: 'weeks', badge: 'T-3w', label: '3 Weeks before', reason: 'Final micro-adjustments' },
    ],
    deliverables: [
      { title: 'Bring wedding shoes and undergarments to fitting', type: 'document' },
      { title: 'Schedule final collection date with tailor', type: 'booking' },
    ],
  },
  {
    id: 'marriage-license',
    name: 'Apply for Marriage License & Legal Paperwork',
    category: 'admin',
    keywords: ['marriage license', 'wedding registry', 'marriage certificate', 'officiant paperwork'],
    minimumLeadDays: 30,
    idealLeadDays: 45,
    badge: 'T-6w',
    reason: 'Local registries and city halls have mandatory waiting periods and expiration windows (typically 30-60 days).',
    alternatives: [
      { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Standard civil registrar appointment' },
      { amount: 3, unit: 'weeks', badge: 'T-3w', label: '3 Weeks before', reason: 'Direct clerk walk-in jurisdictions' },
    ],
    deliverables: [
      { title: 'Government IDs and birth certificates gathered', type: 'document' },
      { title: 'Registry appointment completed and license issued', type: 'document' },
    ],
  },

  // =========================================================================
  // 2. PET CARE, DOG SITTERS & BOARDING (4-8 Weeks)
  // =========================================================================
  {
    id: 'pet-sitter-booking',
    name: 'Book Dog Sitter / Cat Sitter / Pet Boarding',
    category: 'booking',
    keywords: [
      'dog sitter', 'dogsitter', 'cat sitter', 'catsitter', 'pet sitter', 'petsitter',
      'dog boarding', 'dogboarding', 'pet boarding', 'petboarding',
      'kennel', 'cattery', 'dog hotel', 'pet hotel', 'doggy daycare', 'dog walker',
      'arrange dog sitter', 'book dog sitter', 'find dog sitter'
    ],
    minimumLeadDays: 28,
    idealLeadDays: 45,
    badge: 'T-6w',
    reason: 'Quality pet sitters and reputable boarding facilities reach full capacity 4 to 8 weeks in advance, especially around holidays, school breaks, and weekends.',
    alternatives: [
      { amount: 8, unit: 'weeks', badge: 'T-8w', label: '8 Weeks before', reason: 'Peak summer holidays, Christmas, or long bank holiday weekends' },
      { amount: 4, unit: 'weeks', badge: 'T-4w', label: '4 Weeks before', reason: 'Standard weekend travel or regular trusted sitter' },
      { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Short 1-night local sitting with family or neighbor' },
    ],
    deliverables: [
      { title: 'Confirmed booking dates with sitter or boarding facility', type: 'booking' },
      { title: 'Verify pet vaccination certificate (kennel cough & rabies)', type: 'document' },
    ],
  },
  {
    id: 'pet-vet-check',
    name: 'Check Pet Vaccinations & Meet-and-Greet Sitter',
    category: 'prep',
    keywords: ['pet vaccination', 'vet check', 'dog vaccination', 'kennel cough', 'sitter meet and greet'],
    minimumLeadDays: 14,
    idealLeadDays: 21,
    badge: 'T-3w',
    reason: 'Kennels require vaccines (like Bordetella) administered at least 14 days before drop-off to build immunity.',
    alternatives: [
      { amount: 3, unit: 'weeks', badge: 'T-3w', label: '3 Weeks before', reason: 'Vaccine booster window' },
      { amount: 1, unit: 'weeks', badge: 'T-1w', label: '1 Week before', reason: 'Key handover and home walk-through' },
    ],
    deliverables: [
      { title: 'Up-to-date vet vaccination records on file', type: 'document' },
      { title: 'Meet-and-greet walk with dog and sitter completed', type: 'coordination' },
    ],
  },
  {
    id: 'pet-instructions-prep',
    name: 'Write Pet Care Instructions & Medication Details',
    category: 'prep',
    keywords: ['pet instructions', 'dog food instructions', 'sitter instructions', 'vet emergency contact'],
    minimumLeadDays: 3,
    idealLeadDays: 4,
    badge: 'T-3d',
    reason: 'Provides clear written routines for feeding portions, medications, emergency vet numbers, and microchip info.',
    alternatives: [
      { amount: 4, unit: 'days', badge: 'T-4d', label: '4 Days before', reason: 'Detailed medication routines' },
      { amount: 1, unit: 'days', badge: 'T-1d', label: '1 Day before', reason: 'Leaving out food bowls, leash, and treats' },
    ],
    deliverables: [
      { title: 'Printed emergency vet contact & daily routine sheet', type: 'document' },
      { title: 'Portioned pet food, favorite toys & leash ready by door', type: 'purchase' },
    ],
  },

  // =========================================================================
  // 3. INTERNATIONAL TRAVEL, PASSPORTS, VISAS & VACATIONS
  // =========================================================================
  {
    id: 'passport-visa',
    name: 'Check Passport 6-Month Validity & Apply for Visa',
    category: 'admin',
    keywords: [
      'passport', 'renew passport', 'passport validity', 'travel visa', 'e-visa',
      'esta', 'entry permit', 'eta application', 'visa application'
    ],
    minimumLeadDays: 60,
    idealLeadDays: 75,
    badge: 'T-10w',
    reason: 'Most countries require at least 6 months of passport validity past your travel date, and standard passport/visa processing takes 6 to 10 weeks.',
    alternatives: [
      { amount: 12, unit: 'weeks', badge: 'T-12w', label: '12 Weeks before', reason: 'Standard passport renewal processing time' },
      { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Online e-Visa / ESTA applications' },
      { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Urgent expedited emergency passport appointments' },
    ],
    deliverables: [
      { title: 'Verify passport expiration date is 6+ months beyond return date', type: 'document' },
      { title: 'Approved visa or electronic travel authorization printed', type: 'document' },
    ],
  },
  {
    id: 'international-flights',
    name: 'Book International Flights & Long-Haul Transport',
    category: 'booking',
    keywords: ['book flights', 'international flight', 'airline tickets', 'plane tickets', 'long haul flight', 'flight booking'],
    minimumLeadDays: 60,
    idealLeadDays: 90,
    badge: 'T-12w',
    reason: 'Booking international flights 2 to 4 months out secures better prices, direct routes, and family seat selections.',
    alternatives: [
      { amount: 16, unit: 'weeks', badge: 'T-16w', label: '16 Weeks before', reason: 'Peak summer, Easter, or holiday seasons' },
      { amount: 8, unit: 'weeks', badge: 'T-8w', label: '8 Weeks before', reason: 'Mid-haul European or domestic routes' },
    ],
    deliverables: [
      { title: 'Confirmed flight tickets with booking reference and seat selection', type: 'booking' },
      { title: 'Check checked luggage allowances and baggage fees', type: 'document' },
    ],
  },
  {
    id: 'vacation-lodging',
    name: 'Book Vacation Rental, Villa or Hotel',
    category: 'booking',
    keywords: ['book hotel', 'book airbnb', 'vacation rental', 'villa rental', 'resort booking', 'cabin rental'],
    minimumLeadDays: 45,
    idealLeadDays: 60,
    badge: 'T-8w',
    reason: 'Desirable vacation rentals, beachfront houses, and central hotel rooms fill up quickly during travel seasons.',
    alternatives: [
      { amount: 12, unit: 'weeks', badge: 'T-12w', label: '12 Weeks before', reason: 'Large family villas and unique vacation homes' },
      { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Standard city hotels with flexible cancellation' },
    ],
    deliverables: [
      { title: 'Confirmed accommodation booking code & check-in guidelines', type: 'booking' },
      { title: 'Check cancellation deadline and note on calendar', type: 'document' },
    ],
  },
  {
    id: 'rental-car-idp',
    name: 'Book Rental Car & Check International Driving Permit',
    category: 'booking',
    keywords: ['rental car', 'hire car', 'car rental', 'international driving permit', 'idp'],
    minimumLeadDays: 28,
    idealLeadDays: 35,
    badge: 'T-5w',
    reason: 'Car hire inventory at popular airport destinations can sell out or triple in price closer to departure.',
    alternatives: [
      { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Island or remote destinations with limited vehicle fleets' },
      { amount: 3, unit: 'weeks', badge: 'T-3w', label: '3 Weeks before', reason: 'Standard airport pickup' },
    ],
    deliverables: [
      { title: 'Confirmed vehicle rental voucher with insurance coverage', type: 'booking' },
      { title: 'Check driver license validity and obtain IDP if required', type: 'document' },
    ],
  },
  {
    id: 'high-demand-tickets',
    name: 'Book High-Demand Excursion & Museum Tickets',
    category: 'booking',
    keywords: ['museum tickets', 'excursion booking', 'tour tickets', 'theme park tickets', 'disney tickets', 'colosseum', 'louvre', 'sagrada familia'],
    minimumLeadDays: 28,
    idealLeadDays: 42,
    badge: 'T-6w',
    reason: 'World-famous sights (Louvre, Alhambra, Sagrada Familia, national park passes) sell out weeks in advance.',
    alternatives: [
      { amount: 8, unit: 'weeks', badge: 'T-8w', label: '8 Weeks before', reason: 'Strict entry-quota landmarks' },
      { amount: 3, unit: 'weeks', badge: 'T-3w', label: '3 Weeks before', reason: 'General guided city tours' },
    ],
    deliverables: [
      { title: 'Entry passes and timed slot barcodes downloaded', type: 'booking' },
      { title: 'Saved attraction addresses and entry gate locations', type: 'document' },
    ],
  },

  // =========================================================================
  // 4. PARTIES, DINNERS & SOCIAL CELEBRATIONS
  // =========================================================================
  {
    id: 'party-venue-dj',
    name: 'Book Party Venue, DJ or Live Entertainment',
    category: 'booking',
    keywords: ['hire dj', 'party dj', 'party venue', 'private dining room', 'karaoke room', 'band for party', 'live music'],
    minimumLeadDays: 21,
    idealLeadDays: 35,
    badge: 'T-5w',
    reason: 'Private rooms, cocktail bars, and DJs require several weeks of advance booking for Friday/Saturday slots.',
    alternatives: [
      { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Milestone 30th/40th/50th birthday party spaces' },
      { amount: 3, unit: 'weeks', badge: 'T-3w', label: '3 Weeks before', reason: 'Restaurant group tables & private booths' },
    ],
    deliverables: [
      { title: 'Signed room booking confirmation or DJ deposit receipt', type: 'booking' },
      { title: 'Curated music playlist and favorite tracks list', type: 'document' },
    ],
  },
  {
    id: 'party-invitations',
    name: 'Send Invitations & Collect RSVPs',
    category: 'prep',
    keywords: ['send invitations', 'party invites', 'birthday invites', 'collect rsvps', 'guest headcount', 'digital invites'],
    minimumLeadDays: 21,
    idealLeadDays: 28,
    badge: 'T-4w',
    reason: 'Giving guests 3 to 4 weeks allows them to clear their schedules and gives you time to plan food and drinks.',
    alternatives: [
      { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Formal milestone anniversaries or destination parties' },
      { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Casual get-togethers or drinks' },
    ],
    deliverables: [
      { title: 'Sent digital or printed invitations to guest list', type: 'coordination' },
      { title: 'Track confirmed headcounts and food allergies', type: 'document' },
    ],
  },
  {
    id: 'custom-cake-catering',
    name: 'Order Custom Cake from Bakery or Book Catering',
    category: 'shopping',
    keywords: ['custom cake', 'birthday cake', 'order cake', 'bakery order', 'party catering', 'caterer', 'party platters'],
    minimumLeadDays: 7,
    idealLeadDays: 14,
    badge: 'T-2w',
    reason: 'Artisan bakeries and caterers need 1 to 2 weeks notice for custom decorations, multi-tiered cakes, and fresh ingredient sourcing.',
    alternatives: [
      { amount: 3, unit: 'weeks', badge: 'T-3w', label: '3 Weeks before', reason: 'Intricate themed fondant or wedding-style cakes' },
      { amount: 1, unit: 'weeks', badge: 'T-1w', label: '1 Week before', reason: 'Standard bakery pre-orders' },
    ],
    deliverables: [
      { title: 'Confirmed cake flavor, custom text, and pickup time window', type: 'purchase' },
      { title: 'Finalized food platter counts with caterer', type: 'booking' },
    ],
  },
  {
    id: 'party-outfit-styling',
    name: 'Pick Out Outfits, Dry Cleaning or Alterations',
    category: 'costume',
    keywords: ['outfit', 'costume', 'dry cleaning', 'suit dry clean', 'haircut', 'party outfit', 'tailoring'],
    minimumLeadDays: 5,
    idealLeadDays: 7,
    badge: 'T-7d',
    reason: 'Dry cleaners typically require 3 to 5 business days, and finding missing accessories is stress-free with a week of buffer.',
    alternatives: [
      { amount: 2, unit: 'weeks', badge: 'T-2w', label: '2 Weeks before', reason: 'Complex costume ordering or tailoring' },
      { amount: 3, unit: 'days', badge: 'T-3d', label: '3 Days before', reason: 'Trying on existing wardrobe and ironing' },
    ],
    deliverables: [
      { title: 'Outfits picked out, ironed, and ready on hangers', type: 'coordination' },
      { title: 'Shoes polished and accessories gathered', type: 'purchase' },
    ],
  },

  // =========================================================================
  // 5. KIDS, SCHOOL & YOUTH HOBBIES
  // =========================================================================
  {
    id: 'kids-camp-registration',
    name: 'Register for Summer Camp or Holiday Activity Club',
    category: 'booking',
    keywords: ['summer camp', 'holiday camp', 'camp registration', 'activity club', 'swim lessons'],
    minimumLeadDays: 60,
    idealLeadDays: 90,
    badge: 'T-12w',
    reason: 'Top summer camps open registration in early spring and fill up within weeks.',
    alternatives: [
      { amount: 16, unit: 'weeks', badge: 'T-16w', label: '16 Weeks before', reason: 'Popular municipal and sports camps' },
      { amount: 6, unit: 'weeks', badge: 'T-6w', label: '6 Weeks before', reason: 'Local day clubs' },
    ],
    deliverables: [
      { title: 'Submitted registration form and paid deposit', type: 'booking' },
      { title: 'Medical authorization & emergency contacts provided', type: 'document' },
    ],
  },
  {
    id: 'kids-school-project',
    name: 'Buy Project Materials & Outline Steps',
    category: 'shopping',
    keywords: ['school project', 'science fair', 'book week', 'presentation board', 'craft supplies'],
    minimumLeadDays: 14,
    idealLeadDays: 21,
    badge: 'T-3w',
    reason: 'Gives the child multiple weekends to build, experiment, and assemble the project without last-night panic.',
    alternatives: [
      { amount: 3, unit: 'weeks', badge: 'T-3w', label: '3 Weeks before', reason: 'Science fair experiments needing observation days' },
      { amount: 1, unit: 'weeks', badge: 'T-1w', label: '1 Week before', reason: 'Poster board and simple craft materials' },
    ],
    deliverables: [
      { title: 'Poster boards, markers, and supplies purchased', type: 'purchase' },
      { title: 'Project rubric and milestone dates checked', type: 'document' },
    ],
  },
];

/**
 * Intelligent Retrieval: finds the most accurate prep task rule from our knowledge base
 */
export function lookupTaskTiming(taskText: string, contextText: string = ''): PrepTaskRule | null {
  const query = `${taskText} ${contextText}`.toLowerCase();

  // Match by keyword score
  let bestMatch: PrepTaskRule | null = null;
  let highestScore = 0;

  for (const rule of PREP_KNOWLEDGE_DATABASE) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (query.includes(kw.toLowerCase())) {
        score += kw.length * 2; // longer exact keyword match has higher weight
      }
    }
    if (score > highestScore && score >= 6) {
      highestScore = score;
      bestMatch = rule;
    }
  }

  return bestMatch;
}

/**
 * Calculates human-readable lead time badge and millisecond offset
 */
export function formatLeadTime(days: number): { badge: string; offsetMinutes: number; unit: 'weeks' | 'days' | 'hours' | 'months'; amount: number } {
  const offsetMinutes = -days * 24 * 60;
  if (days >= 60) {
    const months = Math.round(days / 30);
    return { badge: `T-${months}m`, offsetMinutes, unit: 'months', amount: months };
  }
  if (days >= 14 && days % 7 === 0) {
    const weeks = Math.round(days / 7);
    return { badge: `T-${weeks}w`, offsetMinutes, unit: 'weeks', amount: weeks };
  }
  if (days >= 14) {
    const weeks = Math.round(days / 7);
    return { badge: `T-${weeks}w`, offsetMinutes, unit: 'weeks', amount: weeks };
  }
  return { badge: `T-${days}d`, offsetMinutes, unit: 'days', amount: days };
}

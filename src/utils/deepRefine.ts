import { CalendarEvent, TMinusMilestone, MilestoneCategory } from '../types';
import { calculateOffsetDate } from './tminusRules';
import { inferTaskTimingLocally } from './timingAI';

/**
 * Generates an intelligent, domain-tailored T-Minus milestone plan for any calendar event.
 * Uses deep real-world logistical constraints (booking lead times, artisan crafting, freshness, packing buffers).
 */
export function deepRefineEventLocally(event: CalendarEvent): TMinusMilestone[] {
  const title = event.title || 'Upcoming Event';
  const text = `${title} ${event.location || ''} ${JSON.stringify(event.context || {})}`.toLowerCase();
  const eventDate = event.eventDate;
  const eventTime = event.eventTime || '19:00';
  const eventId = event.id;

  const milestones: TMinusMilestone[] = [];

  const add = (
    label: string,
    offsetMinutes: number,
    taskTitle: string,
    category: MilestoneCategory,
    description: string
  ) => {
    const calculatedDate = calculateOffsetDate(eventDate, eventTime, offsetMinutes);
    milestones.push({
      id: `ms-${eventId}-${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Math.random().toString(36).substring(2, 6)}`,
      eventId,
      tMinusLabel: label,
      tMinusOffsetMinutes: offsetMinutes,
      calculatedDate,
      title: taskTitle,
      description,
      category,
      status: 'pending',
    });
  };

  // 1. Karaoke / Entertainment Booths / Escape Rooms / Bowling / Gaming
  if (text.match(/\b(karaoke|karaoke booth|karaoke room|singing room|escape room|bowling|arcade|laser tag|vr lounge|topgolf|mini golf)\b/)) {
    add('T-3w', -3 * 7 * 24 * 60, 'Book private room / booth & lock time slot', 'booking', 
      'Private entertainment rooms experience heavy weekend demand; booking 3 weeks ahead secures your preferred room size and optimal peak time slot.');
    add('T-10d', -10 * 24 * 60, 'Confirm attendees & gather track / game requests', 'prep', 
      'Collect headcounts to ensure room capacity fits everyone comfortably and pool favorite song/activity requests.');
    add('T-3d', -3 * 24 * 60, 'Confirm reservation & pre-order drink packages', 'booking', 
      'Re-verify booking with the venue host, check group food/drink packages, and share arrival directions with the group.');
    add('T-2h', -120, 'Departure buffer & venue arrival check', 'logistics', 
      'Leave early to account for parking/transit and arrive 15 minutes prior to start time for check-in.');
  }
  // 2. Trips, Travel, Vacation, Flights, Camping
  else if (text.match(/\b(flight|trip|vacation|holiday|travel|hotel|airbnb|campsite|camping|resort|getaway|barcelona|paris|tokyo|london|rome|hawaii)\b/)) {
    add('T-60d', -60 * 24 * 60, 'Passport validity & entry requirement check', 'booking', 
      'Verify passport has 6+ months validity remaining and review destination visa/e-visa requirements.');
    add('T-30d', -30 * 24 * 60, 'Lock flights, train tickets & accommodations', 'booking', 
      'Securing transportation and lodging 4 weeks early avoids steep last-minute surge pricing and limited room choices.');
    add('T-21d', -21 * 24 * 60, 'Book guided tours & landmark tickets', 'booking', 
      'Popular museums, historic landmarks, and sightseeing activities frequently sell out weeks in advance.');
    add('T-14d', -14 * 24 * 60, 'Buy destination travel essentials & adapters', 'shopping', 
      'Acquire country-specific plug adapters, sunscreen, toiletries, and destination-appropriate outerwear.');
    add('T-3d', -3 * 24 * 60, 'Luggage packing & roaming eSIM setup', 'prep', 
      'Pack versatile weather layers, assemble carry-on essentials, and activate international cellular roaming.');
    add('T-1d', -24 * 60, '24-Hour flight check-in & home prep', 'logistics', 
      'Check in online for boarding passes, download offline city maps, and set work out-of-office auto-replies.');
    add('T-3h', -180, 'Airport departure & terminal arrival', 'logistics', 
      'Allow ample transit and airport security screening buffer to arrive stress-free at the departure gate.');
  }
  // 3. Birthdays & Celebrations
  else if (text.match(/\b(birthday|bday|b-day|turning \d+|sweet 16|bar mitzvah|bat mitzvah|\bparty\b|anniversary|celebration)\b/)) {
    add('T-3w', -3 * 7 * 24 * 60, 'Send invitations & set RSVP cutoff', 'booking', 
      'Giving guests 3 weeks notice allows them to clear their weekend calendars and guarantees accurate attendance planning.');
    add('T-2w', -2 * 7 * 24 * 60, 'Order personalized birthday gift', 'gift', 
      'Allows enough time for artisan crafting, online parcel shipping, and potential delivery buffer.');
    add('T-7d', -7 * 24 * 60, 'Order custom bakery cake & refreshments', 'shopping', 
      'Bakery decorators require 5 to 7 days advance notice for custom flavors, inscriptions, and themed decorations.');
    add('T-2d', -2 * 24 * 60, 'Wrap gift & write birthday card', 'prep', 
      'Wrap present, write a personal message in the card, and check ribbon, tags, and gift bag.');
    add('T-4h', -240, 'Retrieve bakery cake & chill drinks', 'shopping', 
      'Pick up fresh cake from the bakery, keep refrigerated, and set party beverages on ice.');
    add('T-1h', -60, 'Departure & party arrival', 'logistics', 
      'Gather cards, presents, and travel with time buffer to welcome the guest of honor.');
  }
  // 4. Hosting Visitors & Guests
  else if (text.match(/\b(visiting|staying with|in town|hosting|sleepover|guest|hosting visitors|family visit)\b/)) {
    add('T-2w', -2 * 7 * 24 * 60, 'Confirm arrival itinerary & dietary preferences', 'booking', 
      'Confirm flight arrival times, guest room needs, and any dietary restrictions before planning meals.');
    add('T-1w', -7 * 24 * 60, 'Book group restaurant tables & activities', 'booking', 
      'Reserve dining spots and popular local attractions to avoid long weekend wait times.');
    add('T-3d', -3 * 24 * 60, 'Guest room deep clean & fresh linens', 'prep', 
      'Prepare guest bed with fresh sheets, set out plush bath towels, extra blankets, and Wi-Fi credentials.');
    add('T-1d', -24 * 60, 'Grocery run for guest snacks & breakfast favorites', 'shopping', 
      'Stock the kitchen with fresh coffee, breakfast staples, fruits, and guest favorite drinks.');
    add('T-2h', -120, 'Welcome setup & beverage chill', 'prep', 
      'Tidy living areas, chill welcome drinks, and check flight status for on-time arrival.');
  }
  // 5. Dinners, Socials & Group Dining
  else if (text.match(/\b(dinner|supper|lunch|brunch|dining|bbq|barbecue|cocktails|drinks with|gathering|restaurant|tasting)\b/)) {
    add('T-2w', -2 * 7 * 24 * 60, 'Reserve restaurant table or lock dinner menu', 'booking', 
      'High-demand dining venues fill up weeks ahead for prime dinner seatings; book early to ensure group seating.');
    add('T-3d', -3 * 24 * 60, 'Confirm RSVPs & dietary notes with restaurant/guests', 'booking', 
      'Re-confirm headcount with the restaurant or purchase specialty wine and table ingredients.');
    add('T-1d', -24 * 60, 'Prep ingredients or check dress code', 'prep', 
      'Coordinate attire, marinate ingredients if cooking at home, and verify directions.');
    add('T-2h', -120, 'Freshen up & departure buffer', 'logistics', 
      'Get dressed, ensure navigation is set, and arrive 5 minutes prior to reservation.');
  }
  // 6. Concerts, Festivals & Live Shows
  else if (text.match(/\b(festival|concert|gig|glastonbury|show|live music|theatre|theater|rave|orchestra)\b/)) {
    add('T-4w', -4 * 7 * 24 * 60, 'Confirm tickets & lock transit / hotel', 'booking', 
      'Ticket demand and nearby hotel prices surge significantly as event dates approach.');
    add('T-2w', -2 * 7 * 24 * 60, 'Source outfit, ear protection & gear', 'costume', 
      'High-fidelity acoustic earplugs, weather-appropriate festival clothing, and comfortable footwear.');
    add('T-3d', -3 * 24 * 60, 'Review timetable & venue bag policy', 'logistics', 
      'Check artist set times, venue security restrictions (e.g. clear bag rules), and public transit options.');
    add('T-3h', -180, 'Digital wallet check & battery charge', 'prep', 
      'Charge portable power bank, save tickets to digital wallet, and head out with ample traffic buffer.');
  }
  // 7. Work, Project, Presentation & Deadlines
  else if (text.match(/\b(deadline|launch|sprint|demo|release|milestone|presentation|pitch|hackathon|audit|client review|board meeting)\b/)) {
    add('T-3w', -3 * 7 * 24 * 60, 'Align project scope & stakeholder deliverables', 'work', 
      'Clarify key performance requirements, ownership, and core deliverable scope with stakeholders.');
    add('T-10d', -10 * 24 * 60, 'Draft deliverable & internal peer review', 'review', 
      'Complete comprehensive first draft and circulate for feedback from technical and leadership peers.');
    add('T-3d', -3 * 24 * 60, 'Incorporate final revisions & slide styling', 'prep', 
      'Refine presentation deck, verify data points, and practice smooth speaking transitions.');
    add('T-1d', -24 * 60, 'Dry run rehearsal & AV check', 'logistics', 
      'Test screen-sharing equipment, backup presentation files offline, and verify meeting room links.');
    add('T-1h', -60, 'Final prep & mental focus', 'logistics', 
      'Open slide deck, silence notifications, and join 5 minutes early for technical check.');
  }
  // 8. Maintenance, Auto Service & Home Care
  else if (text.match(/\b(service|car inspection|oil change|dentist|doctor|checkup|vet|veterinarian|maintenance|mechanic|hvac|garage)\b/)) {
    add('T-2w', -2 * 7 * 24 * 60, 'Book appointment & review service history', 'booking', 
      'Schedule preferred technician or doctor time slot and gather previous service records.');
    add('T-3d', -3 * 24 * 60, 'Confirm appointment & quote', 'logistics', 
      'Re-confirm drop-off timing, estimated duration, and scope of work.');
    add('T-1d', -24 * 60, 'Pre-service vehicle / access prep', 'prep', 
      'Clear vehicle trunk or access area, gather keys, logbooks, and necessary paperwork.');
    add('T-1h', -60, 'Departure & check-in', 'logistics', 
      'Arrive on time to ensure prompt service intake.');
  }
  // 9. Default Comprehensive Blueprint
  else {
    add('T-2w', -2 * 7 * 24 * 60, `Advance planning for ${title}`, 'booking', 
      'Lock in necessary reservations, invitations, or supplies to establish a clear preparation timeline.');
    add('T-1w', -7 * 24 * 60, 'Secure materials & review requirements', 'shopping', 
      'Order or purchase specific items, verify details, and eliminate supply bottlenecks.');
    add('T-2d', -2 * 24 * 60, 'Detailed preparation & check', 'prep', 
      'Complete hands-on prep, verify schedule timings, and notify relevant participants.');
    add('T-2h', -120, 'Final departure & arrival buffer', 'logistics', 
      'Double-check belongings, set travel directions, and arrive calmly on time.');
  }

  // Sort chronologically (earliest first: largest negative offset)
  return milestones.sort((a, b) => new Date(a.calculatedDate).getTime() - new Date(b.calculatedDate).getTime());
}

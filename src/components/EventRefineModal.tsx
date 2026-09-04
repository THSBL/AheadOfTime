import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  Gift, 
  Utensils, 
  Car, 
  SlidersHorizontal, 
  Plus, 
  Check, 
  Plane, 
  Home, 
  Briefcase, 
  Shirt, 
  PartyPopper,
  ShieldCheck,
  Megaphone,
  Wrench,
  FileCheck,
  MapPin,
  Calendar,
  Clock,
  CheckSquare,
  Square,
  Sparkle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CalendarEvent, EventCategory, TMinusMilestone } from '../types';
import { generateHeuristicMilestones, formatDisplayDate } from '../utils/tminusRules';

interface EventRefineModalProps {
  isOpen: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onApplyRefinement: (updatedEvent: CalendarEvent) => void;
  currentReferenceDate?: string;
}

export const EventRefineModal: React.FC<EventRefineModalProps> = ({
  isOpen,
  event,
  onClose,
  onApplyRefinement,
}) => {
  if (!isOpen || !event) return null;

  // Basic event fields
  const [title, setTitle] = useState(event.title);
  const [category, setCategory] = useState<EventCategory>(event.category || 'birthday_party');
  const [eventDate, setEventDate] = useState(event.eventDate);
  const [eventTime, setEventTime] = useState(event.eventTime || '19:00');
  const [location, setLocation] = useState(event.location || '');

  // 1. BIRTHDAY PRESET REFINEMENTS
  const [giftType, setGiftType] = useState<string>(event.context?.giftType || 'solo');
  const [isThemed, setIsThemed] = useState<boolean>(Boolean(event.context?.isThemed));
  const [themeText, setThemeText] = useState<string>(event.context?.theme || '');
  const [transportType, setTransportType] = useState<string>(event.context?.transportType || 'none');
  const [foodPlan, setFoodPlan] = useState<string>(event.context?.foodPlan || 'custom_cake');
  const [partyVendors, setPartyVendors] = useState<string[]>(() => {
    if (Array.isArray(event.context?.neededItems)) return event.context.neededItems;
    if (typeof event.context?.neededItems === 'string') {
      return event.context.neededItems.split(',').map((s: string) => s.trim()).filter(Boolean);
    }
    return [];
  });

  // 2. HOSTING / VISITORS PRESET REFINEMENTS
  const [diningRestaurant, setDiningRestaurant] = useState<boolean>(
    event.context?.diningRestaurant !== false
  );
  const [diningBreakfastHouse, setDiningBreakfastHouse] = useState<boolean>(
    event.context?.diningBreakfastHouse !== false
  );
  const [diningHomeCooked, setDiningHomeCooked] = useState<boolean>(
    event.context?.diningHomeCooked !== false
  );
  const [activityTouristSpots, setActivityTouristSpots] = useState<boolean>(
    event.context?.activityTouristSpots !== false
  );
  const [activityHiking, setActivityHiking] = useState<boolean>(
    Boolean(event.context?.activityHiking)
  );
  const [activityBoardGames, setActivityBoardGames] = useState<boolean>(
    event.context?.activityBoardGames !== false
  );
  const [stayGuestRoom, setStayGuestRoom] = useState<boolean>(
    event.context?.stayGuestRoom !== false
  );
  const [recommendAccommodation, setRecommendAccommodation] = useState<boolean>(
    Boolean(event.context?.recommendAccommodation)
  );

  // 3. TRAVEL / TRIP PRESET REFINEMENTS
  const [needPassportRenewal, setNeedPassportRenewal] = useState<boolean>(
    Boolean(event.context?.needPassportRenewal)
  );
  const [needVisa, setNeedVisa] = useState<boolean>(
    Boolean(event.context?.needVisa)
  );
  const [needFlights, setNeedFlights] = useState<boolean>(
    event.context?.needFlights !== false
  );
  const [needHotel, setNeedHotel] = useState<boolean>(
    event.context?.needHotel !== false
  );
  const [needRentalCar, setNeedRentalCar] = useState<boolean>(
    Boolean(event.context?.needRentalCar)
  );
  const [lockActivities, setLockActivities] = useState<boolean>(
    event.context?.activitySightseeing !== false
  );
  const [gearSunscreen, setGearSunscreen] = useState<boolean>(
    Boolean(event.context?.gearSunscreen)
  );
  const [gearHikingBoots, setGearHikingBoots] = useState<boolean>(
    Boolean(event.context?.gearHikingBoots)
  );
  const [gearSnorkelGear, setGearSnorkelGear] = useState<boolean>(
    Boolean(event.context?.gearSnorkelGear)
  );
  const [gearSkiGear, setGearSkiGear] = useState<boolean>(
    Boolean(event.context?.gearSkiGear)
  );
  const [gearAdapters, setGearAdapters] = useState<boolean>(
    event.context?.gearAdapters !== false
  );
  const [returnDate, setReturnDate] = useState<string>(
    event.context?.returnDate || ''
  );

  // 4. PROJECT DEADLINE PRESET REFINEMENTS
  const [stakeholderReview, setStakeholderReview] = useState<string>(
    event.context?.stakeholderReview || 'client'
  );
  const [qaFreeze, setQaFreeze] = useState<string>(
    event.context?.qaFreeze || 'full'
  );
  const [marketingCollateral, setMarketingCollateral] = useState<string>(
    event.context?.marketingCollateral || 'press'
  );

  // 5. SUBSCRIPTION PRESET REFINEMENTS
  const [noticePeriod, setNoticePeriod] = useState<string>(
    event.context?.noticePeriod || '30d'
  );

  // 6. MAINTENANCE PRESET REFINEMENTS
  const [maintenanceServiceType, setMaintenanceServiceType] = useState<string>(
    event.context?.maintenanceServiceType || 'pro'
  );

  // 7. FESTIVAL & CONCERT PRESET REFINEMENTS
  const [isCamping, setIsCamping] = useState<boolean>(
    event.context?.isCamping !== false
  );

  // 8. DINNER & SOCIAL DINING PRESET REFINEMENTS
  const [dinnerDietaryNotes, setDinnerDietaryNotes] = useState<string>(
    event.context?.dietaryNotes || ''
  );

  // MULTI-ENTRY CUSTOM TASKS & PROMPT EXTRAS
  const [customTaskInput, setCustomTaskInput] = useState<string>('');
  const [customTasks, setCustomTasks] = useState<string[]>(() => {
    const existing = event.context?.customItems;
    if (Array.isArray(existing)) return existing;
    return [];
  });

  // Sync state whenever active event updates
  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setCategory(event.category || 'birthday_party');
      setEventDate(event.eventDate);
      setEventTime(event.eventTime || '19:00');
      setLocation(event.location || '');

      // Birthday
      setGiftType(event.context?.giftType || 'solo');
      setIsThemed(Boolean(event.context?.isThemed));
      setThemeText(event.context?.theme || '');
      setTransportType(event.context?.transportType || 'none');
      setFoodPlan(event.context?.foodPlan || 'custom_cake');
      const v = Array.isArray(event.context?.neededItems) 
        ? event.context.neededItems 
        : typeof event.context?.neededItems === 'string'
          ? event.context.neededItems.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];
      setPartyVendors(v);

      // Hosting
      setDiningRestaurant(event.context?.diningRestaurant !== false);
      setDiningBreakfastHouse(event.context?.diningBreakfastHouse !== false);
      setDiningHomeCooked(event.context?.diningHomeCooked !== false);
      setActivityTouristSpots(event.context?.activityTouristSpots !== false);
      setActivityHiking(Boolean(event.context?.activityHiking));
      setActivityBoardGames(event.context?.activityBoardGames !== false);
      setStayGuestRoom(event.context?.stayGuestRoom !== false);
      setRecommendAccommodation(Boolean(event.context?.recommendAccommodation));

      // Trip
      setNeedPassportRenewal(Boolean(event.context?.needPassportRenewal));
      setNeedVisa(Boolean(event.context?.needVisa));
      setNeedFlights(event.context?.needFlights !== false);
      setNeedHotel(event.context?.needHotel !== false);
      setNeedRentalCar(Boolean(event.context?.needRentalCar));
      setLockActivities(event.context?.activitySightseeing !== false);
      setGearSunscreen(Boolean(event.context?.gearSunscreen));
      setGearHikingBoots(Boolean(event.context?.gearHikingBoots));
      setGearSnorkelGear(Boolean(event.context?.gearSnorkelGear));
      setGearSkiGear(Boolean(event.context?.gearSkiGear));
      setGearAdapters(event.context?.gearAdapters !== false);
      setReturnDate(event.context?.returnDate || '');

      // Project
      setStakeholderReview(event.context?.stakeholderReview || 'client');
      setQaFreeze(event.context?.qaFreeze || 'full');
      setMarketingCollateral(event.context?.marketingCollateral || 'press');

      // Subscription
      setNoticePeriod(event.context?.noticePeriod || '30d');

      // Maintenance
      setMaintenanceServiceType(event.context?.maintenanceServiceType || 'pro');

      // Festival
      setIsCamping(event.context?.isCamping !== false);

      // Dinner
      setDinnerDietaryNotes(event.context?.dietaryNotes || '');

      // Custom items
      const c = Array.isArray(event.context?.customItems) ? event.context.customItems : [];
      setCustomTasks(c);
    }
  }, [event?.id]);

  const handleTogglePartyVendor = (name: string) => {
    setPartyVendors(prev => 
      prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]
    );
  };

  const handleAddCustomTask = () => {
    if (!customTaskInput.trim()) return;
    setCustomTasks(prev => [...prev, customTaskInput.trim()]);
    setCustomTaskInput('');
  };

  const handleRemoveCustomTask = (index: number) => {
    setCustomTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Build the enriched context object preserving all preset intake details
    const updatedContext: Record<string, any> = {
      ...(event.context || {}),
      // Birthday
      giftType,
      isThemed,
      theme: isThemed ? themeText : undefined,
      transportType: transportType === 'none' ? undefined : transportType,
      foodPlan,
      neededItems: partyVendors,
      // Hosting
      diningRestaurant,
      diningBreakfastHouse,
      diningHomeCooked,
      activityTouristSpots,
      activityHiking,
      activityBoardGames,
      stayGuestRoom,
      recommendAccommodation,
      // Trip
      needPassportRenewal,
      needVisa,
      needFlights,
      needHotel,
      needRentalCar,
      activitySightseeing: lockActivities,
      gearSunscreen,
      gearHikingBoots,
      gearSnorkelGear,
      gearSkiGear,
      gearAdapters,
      returnDate: returnDate || undefined,
      // Project
      stakeholderReview,
      qaFreeze,
      marketingCollateral,
      // Subscription
      noticePeriod,
      // Maintenance
      maintenanceServiceType,
      // Festival
      isCamping,
      // Dinner
      dietaryNotes: dinnerDietaryNotes || undefined,
      // Custom tasks
      customItems: customTasks,
      // Status flags
      refinedViaPresetUI: true,
      lastRefinedAt: new Date().toISOString(),
    };

    // Recalculate milestones with all the new intake context
    const updatedEventDraft: CalendarEvent = {
      ...event,
      title,
      category,
      eventDate,
      eventTime,
      location,
      status: 'milestones_active',
      needsRefinement: false, // Refinement questionnaire resolved!
      refinedAt: new Date().toISOString(),
      context: updatedContext,
      updatedAt: new Date().toISOString(),
      milestones: [],
    };

    const newMilestones = generateHeuristicMilestones(
      updatedEventDraft,
      event.id,
      eventDate,
      eventTime || '19:00'
    );

    // If user added any explicit custom tasks, ensure they are also added as milestones
    customTasks.forEach((customText, idx) => {
      const alreadyIncluded = newMilestones.some(m => m.title.toLowerCase().includes(customText.toLowerCase()));
      if (!alreadyIncluded) {
        newMilestones.push({
          id: `custom-task-${event.id}-${idx}-${Date.now().toString(36)}`,
          eventId: event.id,
          tMinusLabel: 'T-Minus 3D',
          tMinusOffsetMinutes: -4320,
          calculatedDate: eventDate,
          title: customText,
          description: `Custom prep requirement: ${customText}`,
          category: 'prep',
          status: 'pending',
        });
      }
    });

    updatedEventDraft.milestones = newMilestones;

    confetti({
      particleCount: 45,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#0284c7', '#38bdf8', '#10b981', '#f59e0b'],
    });

    onApplyRefinement(updatedEventDraft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white border border-sky-200/90 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-blue-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-md shadow-sky-600/25 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  Refine Event Schedule
                </h3>
                <span className="text-[10px] font-bold text-sky-800 bg-sky-100/90 px-2 py-0.5 rounded-full border border-sky-200">
                  Preset Intake Questions
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Answer targeted follow-up questions to customize your AheadOfTime preparation milestones.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* 1. Basic Details Card */}
          <div className="bg-sky-50/50 border border-sky-100/80 rounded-2xl p-4 space-y-3.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Event Target &amp; Category
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Event Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Category Preset Form</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as EventCategory)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:border-slate-800 cursor-pointer"
                >
                  <option value="birthday_party">🎂 Birthday / Party Celebration</option>
                  <option value="hosting_visitors">🏡 Hosting Visitors / Weekend Guests</option>
                  <option value="travel_trip">✈️ Trip / Holiday Travel</option>
                  <option value="project_deadline">🚀 Project / Business Deadline</option>
                  <option value="dinner_social">🍽️ Dinner / Social Dining</option>
                  <option value="festival_concert">🎪 Festival &amp; Concert</option>
                  <option value="subscription">💳 Subscription / Renewal</option>
                  <option value="maintenance">🔧 Maintenance / Service</option>
                  <option value="custom">📅 General Event</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Event Date</label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Start Time</label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Location (Optional)</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Home, London, Venue"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-slate-800"
                />
              </div>
            </div>
          </div>

          {/* 2. DYNAMIC PRESET INTAKE FORMS ACCORDING TO CATEGORY */}
          
          {/* CATEGORY 1: BIRTHDAY PARTY (Matching ChatConsole step 2) */}
          {category === 'birthday_party' && (
            <div className="space-y-5">
              
              {/* Question: Gift Strategy */}
              <div className="space-y-2.5">
                <label className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-pink-600" />
                  <span>Do you need a gift?</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { value: 'solo', label: '🎁 Solo Gift', desc: 'Order at T-14d, wrap at T-2d' },
                    { value: 'group', label: '👥 Group Gift Pool', desc: 'Rally pool at T-30d, order at T-10d' },
                    { value: 'none', label: '🚫 No Gift Needed', desc: 'Skip gift milestones' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGiftType(opt.value)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        giftType === opt.value
                          ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className={`text-[10px] leading-tight ${giftType === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Question: Theme & Costume */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Shirt className="w-4 h-4 text-slate-900" />
                  <span className="text-xs sm:text-sm font-bold text-slate-900">Do you need a costume or theme outfit?</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { label: 'Themed / Costume Required', value: true, desc: 'T-14d costume sourcing & outfit prep' },
                    { label: 'Standard Attire / Casual', value: false, desc: 'No costume lead times scheduled' },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setIsThemed(opt.value)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        isThemed === opt.value
                          ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className={`text-[10px] leading-tight ${isThemed === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
                {isThemed && (
                  <input
                    type="text"
                    value={themeText}
                    onChange={(e) => setThemeText(e.target.value)}
                    placeholder="Specify theme (e.g. 80s Disco, Black Tie, Superhero)..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-slate-800 mt-1"
                  />
                )}
              </div>

              {/* Question: Transport */}
              <div className="space-y-2.5">
                <label className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-sky-600" />
                  <span>Do you need transport?</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { value: 'taxi', label: '🚕 Taxi / Rideshare', desc: 'T-2h pre-booking & travel buffer' },
                    { value: 'carpool', label: '🚙 Carpool / Drive', desc: 'T-7d coordination & parking check' },
                    { value: 'transit', label: '🚆 Public Rail / Transit', desc: 'T-1d timetable check & tickets' },
                    { value: 'none', label: '🚫 No Transport Needed', desc: 'Self-arranged or walking distance' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTransportType(opt.value)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        transportType === opt.value
                          ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className={`text-[10px] leading-tight ${transportType === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Question: Food & Drinks Plan */}
              <div className="space-y-2.5">
                <label className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Utensils className="w-4 h-4 text-amber-600" />
                  <span>Food &amp; Drinks Plan</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { value: 'custom_cake', label: '🎂 Custom Bakery Cake', desc: 'T-7d bakery design & T-4h pickup' },
                    { value: 'standard_cake', label: '🍰 Standard Cake & Candles', desc: 'T-1d store pickup' },
                    { value: 'restaurant', label: '🍽️ Restaurant Table', desc: 'T-14d table booking for group' },
                    { value: 'bar', label: '🍸 Bar / Lounge Reservation', desc: 'T-14d drinks area booking' },
                    { value: 'catering', label: '🚚 Party Catering', desc: 'T-7d platters & T-3h delivery' },
                    { value: 'home_cooking', label: '🏡 Home Cooking & Drinks', desc: 'T-2d grocery run & chilling' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFoodPlan(opt.value)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        foodPlan === opt.value
                          ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className={`text-[10px] leading-tight ${foodPlan === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Question: Popular Party Vendors & Bookings */}
              <div className="space-y-2.5">
                <label className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-4 h-4 text-slate-900" />
                  <span>Popular Party Vendors &amp; Bookings (Click to toggle)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'Photographer', label: '📸 Photographer' },
                    { key: 'DJ', label: '🎵 DJ & Music' },
                    { key: 'Balloons', label: '🎈 Balloons & Decor' },
                    { key: 'Projector', label: '📽️ Projector / Slideshow' },
                    { key: 'Speech', label: '🎤 Birthday Speech / Toast' },
                    { key: 'Table reservation', label: '🪑 Table Reservation' },
                  ].map((item) => {
                    const isSelected = partyVendors.includes(item.key);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleTogglePartyVendor(item.key)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />}
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* CATEGORY 2: HOSTING VISITORS (Matching ChatConsole friends preset) */}
          {category === 'hosting_visitors' && (
            <div className="space-y-4">
              
              {/* 1. Dining & Meal Plans */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-slate-900" />
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Select Dining &amp; Meal Plans</h4>
                </div>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={diningRestaurant}
                      onChange={(e) => setDiningRestaurant(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🍽️ Restaurant / Pub Dinner Reservations (T-30d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={diningBreakfastHouse}
                      onChange={(e) => setDiningBreakfastHouse(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🍳 Breakfast &amp; Coffee In-House Groceries (T-3d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={diningHomeCooked}
                      onChange={(e) => setDiningHomeCooked(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🍷 Home-Cooked / Catered Dinners (T-7d)
                    </span>
                  </label>
                </div>
              </div>

              {/* 2. Activities & Entertainment */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-900" />
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Select Activities &amp; Entertainment</h4>
                </div>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activityTouristSpots}
                      onChange={(e) => setActivityTouristSpots(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🗺️ Tourist Spots, City Walks &amp; Museum Tickets (T-14d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activityHiking}
                      onChange={(e) => setActivityHiking(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🥾 Hiking Trails &amp; Outdoor Excursions (T-14d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activityBoardGames}
                      onChange={(e) => setActivityBoardGames(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🎲 Board Games, Movie Night &amp; Pub Trivia (T-7d)
                    </span>
                  </label>
                </div>
              </div>

              {/* 3. Accommodation & Room Prep */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Home className="w-4 h-4 text-slate-900" />
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Accommodation &amp; Room Prep</h4>
                </div>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stayGuestRoom}
                      onChange={(e) => setStayGuestRoom(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🛏️ Guest Room Turnover (Clean Sheets, Towels &amp; Wi-Fi) (T-1d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={recommendAccommodation}
                      onChange={(e) => setRecommendAccommodation(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🏨 Nearby Boutique Hotels &amp; Airbnb Recommendations (T-14d)
                    </span>
                  </label>
                </div>
              </div>

            </div>
          )}

          {/* CATEGORY 3: TRAVEL / TRIP (Matching ChatConsole trip preset) */}
          {category === 'travel_trip' && (
            <div className="space-y-4">
              
              {/* 1. Passports & Visas */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛂</span>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Passport &amp; Visa Validity Checks</h4>
                </div>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needPassportRenewal}
                      onChange={(e) => setNeedPassportRenewal(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🛂 Passport Validity Check &amp; Renewal (T-60d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needVisa}
                      onChange={(e) => setNeedVisa(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      📋 Entry Visa / e-Visa Application (T-45d)
                    </span>
                  </label>
                </div>
              </div>

              {/* 2. Bookings & Logistics */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Plane className="w-4 h-4 text-slate-900" />
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Transport &amp; Accommodation Locks</h4>
                </div>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needFlights}
                      onChange={(e) => setNeedFlights(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🛫 Flights &amp; Airline Price Lock (T-45d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needHotel}
                      onChange={(e) => setNeedHotel(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🏨 Hotel / Accommodation &amp; Cancellation Policy (T-30d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needRentalCar}
                      onChange={(e) => setNeedRentalCar(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🚗 Rental Car &amp; Insurance Verification (T-30d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lockActivities}
                      onChange={(e) => setLockActivities(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🎯 Lock in Activities &amp; Excursion Tickets (T-21d)
                    </span>
                  </label>
                </div>
              </div>

              {/* 3. Return Date Option */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <label className="text-xs font-bold text-slate-700">Trip Return Date (Optional for return flight check)</label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              {/* 4. Packing & Gear Essentials */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎒</span>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Packing Extras &amp; Specialty Gear</h4>
                </div>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gearAdapters}
                      onChange={(e) => setGearAdapters(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🔌 Universal Power Adapters &amp; Chargers (T-14d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gearSunscreen}
                      onChange={(e) => setGearSunscreen(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🧴 Sunscreen &amp; Beach Essentials (SPF 50, hats) (T-14d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gearHikingBoots}
                      onChange={(e) => setGearHikingBoots(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🥾 Hiking Boots &amp; Outdoor Gear (wool socks, daypack) (T-14d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gearSnorkelGear}
                      onChange={(e) => setGearSnorkelGear(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🤿 Snorkel Gear &amp; Water Accessories (T-14d)
                    </span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gearSkiGear}
                      onChange={(e) => setGearSkiGear(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                    />
                    <span className="text-xs sm:text-sm text-slate-700 font-medium">
                      🎿 Ski Gear &amp; Thermal Layers (goggles, helmets) (T-14d)
                    </span>
                  </label>
                </div>
              </div>

            </div>
          )}

          {/* CATEGORY 4: PROJECT DEADLINE (Matching ChatConsole project preset) */}
          {category === 'project_deadline' && (
            <div className="space-y-4">
              
              {/* 1. Stakeholder Review */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-900" />
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">What stakeholder review is required?</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { value: 'client', label: 'Client Sign-Off', desc: 'T-14d formal draft milestone lock' },
                    { value: 'internal', label: 'Internal Team Demo', desc: 'T-7d cross-team review sprint' },
                    { value: 'none', label: '🚫 Solo / No Review', desc: 'Direct execution & launch' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStakeholderReview(opt.value)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        stakeholderReview === opt.value
                          ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm font-bold'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className={`text-[10px] leading-tight ${stakeholderReview === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. QA & Test Freeze */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-slate-900" />
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">QA &amp; Code Freeze Policy</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { value: 'full', label: 'QA Regression Cycle (T-7d)', desc: 'Full feature freeze, bug triage & test suites' },
                    { value: 'skip', label: 'Fast Deploy (No QA cycle)', desc: 'Direct deployment rehearsal at T-1d' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setQaFreeze(opt.value)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        qaFreeze === opt.value
                          ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm font-bold'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className={`text-[10px] leading-tight ${qaFreeze === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Marketing & Launch Collateral */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-slate-900" />
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">Marketing &amp; Launch Collateral?</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { value: 'press', label: 'Public Launch & Press', desc: 'T-3d release collateral & social copy' },
                    { value: 'docs', label: 'Release Notes Only', desc: 'T-2d changelog & internal guides' },
                    { value: 'none', label: '🚫 No Marketing', desc: 'Skip marketing milestones' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMarketingCollateral(opt.value)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                        marketingCollateral === opt.value
                          ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm font-bold'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className={`text-[10px] leading-tight ${marketingCollateral === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                        {opt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* CATEGORY 5: SUBSCRIPTION CANCELLATION (Matching ChatConsole subscription preset) */}
          {category === 'subscription' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-slate-900" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">Cancellation Notice Period Policy</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { value: '30d', label: '30-Day Notice Policy', desc: 'T-30d early review & formal notice' },
                  { value: '14d', label: '14-Day Notice Policy', desc: 'Standard 2-week cancellation notice' },
                  { value: 'immediate', label: 'Immediate Online', desc: 'Click-to-cancel anytime before renewal' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNoticePeriod(opt.value)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      noticePeriod === opt.value
                        ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm font-bold'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className={`text-[10px] leading-tight ${noticePeriod === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CATEGORY 6: MAINTENANCE / SERVICE (Matching ChatConsole maintenance preset) */}
          {category === 'maintenance' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-900" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">Service Provider or DIY Maintenance?</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: 'pro', label: 'Professional Garage / Technician', desc: 'Book slot at T-10d, quote check T-3d, vehicle clear T-1d' },
                  { value: 'diy', label: 'DIY Service & Spare Parts', desc: 'Order replacement fluids/filters at T-10d, prep workspace at T-1d' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMaintenanceServiceType(opt.value)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      maintenanceServiceType === opt.value
                        ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm font-bold'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className={`text-[10px] leading-tight ${maintenanceServiceType === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CATEGORY 7: FESTIVAL & CONCERT */}
          {category === 'festival_concert' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <PartyPopper className="w-4 h-4 text-slate-900" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">Camping &amp; Festival Logistics</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: true, label: '🎪 Camping on Site', desc: 'T-60d tent & gear check, T-14d packing list, T-2d supply run' },
                  { value: false, label: '🏨 Hotel / Day Trip (No camping)', desc: 'T-14d ticket barcode check, T-2h departure meet' },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setIsCamping(opt.value)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      isCamping === opt.value
                        ? 'bg-[#0f172a] text-white border-[#0f172a] shadow-sm font-bold'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className={`text-[10px] leading-tight ${isCamping === opt.value ? 'text-white/80' : 'text-slate-400'}`}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CATEGORY 8: DINNER / SOCIAL DINING */}
          {category === 'dinner_social' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-slate-900" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">Dietary Preferences &amp; Guest RSVPs</h4>
              </div>
              <input
                type="text"
                value={dinnerDietaryNotes}
                onChange={(e) => setDinnerDietaryNotes(e.target.value)}
                placeholder="Any dietary restrictions, wine pairing, or course notes..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-800 bg-white focus:outline-none focus:border-slate-800"
              />
            </div>
          )}

          {/* 3. MULTI-ENTRY CUSTOM TASKS BUILDER (FOR ALL CATEGORIES - MATCHING CHATCONSOLE) */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-sky-600" />
                <span>Anything Specific You'd Like to Include?</span>
              </label>
              <p className="text-xs text-slate-500">
                Add custom tasks, shopping items, equipment rentals, or reminders to weave into your timeline.
              </p>
            </div>

            {/* Input + Add button */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customTaskInput}
                onChange={(e) => setCustomTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTask();
                  }
                }}
                placeholder="e.g. Helium balloon tank, champagne, print boarding pass..."
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium text-slate-800 bg-white focus:outline-none focus:border-slate-800"
              />
              <button
                type="button"
                onClick={handleAddCustomTask}
                disabled={!customTaskInput.trim()}
                className="bg-[#0f172a] hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer flex items-center gap-1 shadow-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add</span>
              </button>
            </div>

            {/* Task list chips */}
            {customTasks.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {customTasks.map((task, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 bg-sky-50 text-sky-950 border border-sky-200 px-3 py-1.5 rounded-xl text-xs font-medium shadow-2xs"
                  >
                    <span>{task}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomTask(idx)}
                      className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-[#0f172a] hover:bg-slate-800 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md shadow-slate-900/20 transition-all cursor-pointer active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-sky-300" />
              <span>Generate Tailored Schedule</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

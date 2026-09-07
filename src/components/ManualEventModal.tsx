import React, { useState } from 'react';
import { X, Calendar, Clock, MapPin, Sparkles, Plus, Trash2, ChevronDown } from 'lucide-react';
import { CalendarEvent, EventCategory } from '../types';
import { generateHeuristicMilestones, detectEventCategory } from '../utils/tminusRules';

interface ManualEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveEvent: (event: CalendarEvent) => void;
  currentReferenceDate: string;
}

export const ManualEventModal: React.FC<ManualEventModalProps> = ({
  isOpen,
  onClose,
  onSaveEvent,
  currentReferenceDate,
}) => {
  if (!isOpen) return null;

  const defaultDate = new Date(currentReferenceDate);
  defaultDate.setDate(defaultDate.getDate() + 21);
  const defaultDateStr = defaultDate.toISOString().substring(0, 10);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('birthday_party');
  const [eventDate, setEventDate] = useState(defaultDateStr);
  const [eventTime, setEventTime] = useState('19:00');
  const [returnDate, setReturnDate] = useState(() => {
    const d = new Date(defaultDateStr);
    d.setDate(d.getDate() + 7);
    return d.toISOString().substring(0, 10);
  });
  const [returnTime, setReturnTime] = useState('17:00');
  const [location, setLocation] = useState('');
  const [showCategoryOptions, setShowCategoryOptions] = useState(false);
  
  // Topic specific context states
  const [giftType, setGiftType] = useState<'group' | 'solo' | 'none'>('group');
  const [isThemed, setIsThemed] = useState(false);
  const [theme, setTheme] = useState('');
  const [needPassportRenewal, setNeedPassportRenewal] = useState(false);
  const [needVisa, setNeedVisa] = useState(false);
  const [lockActivities, setLockActivities] = useState(true);
  const [buyGear, setBuyGear] = useState(true);
  const [isCamping, setIsCamping] = useState(false);
  const [stakeholderReview, setStakeholderReview] = useState<'client' | 'internal' | 'none'>('client');
  const [qaFreeze, setQaFreeze] = useState(true);
  const [customNote, setCustomNote] = useState('');

  // Hosting visitors options state
  const [diningRestaurant, setDiningRestaurant] = useState(true);
  const [diningBreakfastHouse, setDiningBreakfastHouse] = useState(true);
  const [diningHomeCooked, setDiningHomeCooked] = useState(true);
  const [activityTouristSpots, setActivityTouristSpots] = useState(true);
  const [activityHiking, setActivityHiking] = useState(false);
  const [activityBoardGames, setActivityBoardGames] = useState(true);
  const [stayGuestRoom, setStayGuestRoom] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const eventId = `evt-manual-${Date.now()}`;
    const context = {
      giftType,
      isThemed,
      theme: isThemed ? theme : undefined,
      needPassportRenewal,
      needVisa,
      lockActivities,
      buyGear,
      returnDate,
      returnTime,
      isCamping,
      stakeholderReview,
      qaFreeze,
      customNote,
      diningRestaurant,
      diningBreakfastHouse,
      diningHomeCooked,
      activityTouristSpots,
      activityHiking,
      activityBoardGames,
      stayGuestRoom,
    };

    const milestones = generateHeuristicMilestones(
      { category, context },
      eventId,
      eventDate,
      eventTime
    );

    const newEvent: CalendarEvent = {
      id: eventId,
      title: title.trim(),
      category,
      eventDate,
      eventTime,
      location: location.trim() || undefined,
      status: 'milestones_active',
      context,
      milestones,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveEvent(newEvent);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[88dvh] sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Header */}
        <div className="bg-slate-50/90 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <Calendar className="w-4 h-4 text-sky-400" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              Add New Event
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1 overscroll-contain">
          
          {/* Title */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
              Event Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => {
                const val = e.target.value;
                setTitle(val);
                if (val.trim()) {
                  const guessed = detectEventCategory(val);
                  if (guessed && guessed !== 'custom') {
                    setCategory(guessed);
                  }
                }
              }}
              placeholder="E.g., Maya's 30th Birthday, Trip to Kyoto, Dinner Party..."
              className="w-full bg-slate-50/60 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white placeholder:text-slate-400"
            />
          </div>

          {/* Category */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                Category
              </label>
              <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-sky-200">
                <Sparkles className="w-3 h-3 text-sky-500 animate-pulse" />
                Auto-guessed from title
              </span>
            </div>
            <select
              value={category}
              onChange={(e: any) => setCategory(e.target.value)}
              className="w-full bg-slate-50/60 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer"
            >
              <option value="birthday_party">🎂 Wedding / Party / Celebration (Gifts, Themes, Rides)</option>
              <option value="hosting_visitors">🏡 Hosting Visitors (Dinners, Room Prep, Groceries)</option>
              <option value="festival_concert">🎪 Festival & Concert (Camping, Gear, Tickets)</option>
              <option value="travel_trip">✈️ Travel Trip (Passports, Packing, Passes)</option>
              <option value="dinner_social">🍽️ Dinner & Social (RSVPs, Wine, Groceries)</option>
              <option value="custom">🎯 Custom Event</option>
            </select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
                Event Date *
              </label>
              <input
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full bg-slate-50/60 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
                Event Time
              </label>
              <input
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="w-full bg-slate-50/60 text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white cursor-pointer"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
              Location (Optional)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="E.g., Hackney Loft, London"
              className="w-full bg-slate-50/60 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 focus:bg-white placeholder:text-slate-400"
            />
          </div>

          {/* Context Options specific to category */}
          {category !== 'custom' && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowCategoryOptions(!showCategoryOptions)}
                className="w-full flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Category Prep Options
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    (Optional rules)
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-sky-700">
                  <span>{showCategoryOptions ? 'Fewer' : 'More'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${showCategoryOptions ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {showCategoryOptions && (
                <div className="mt-2.5 space-y-3 animate-in fade-in duration-150">
          {/* Travel Trip specific options: Return date and Passport / Visa independent checks */}
          {category === 'travel_trip' && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
                    Return Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full bg-white text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-1.5">
                    Return Time
                  </label>
                  <input
                    type="time"
                    value={returnTime}
                    onChange={(e) => setReturnTime(e.target.value)}
                    className="w-full bg-white text-slate-900 text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900 cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-200/80">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="chk-passport"
                    checked={needPassportRenewal}
                    onChange={(e) => setNeedPassportRenewal(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="chk-passport" className="text-xs sm:text-sm text-slate-700 font-medium">
                    🛂 Check Passport Validity / Expiry Renewal (T-60d)
                  </label>
                </div>

                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="chk-visa"
                    checked={needVisa}
                    onChange={(e) => setNeedVisa(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="chk-visa" className="text-xs sm:text-sm text-slate-700 font-medium">
                    📋 Apply for Entry Visa / e-Visa (T-45d)
                  </label>
                </div>

                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="chk-lock-activities"
                    checked={lockActivities}
                    onChange={(e) => setLockActivities(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="chk-lock-activities" className="text-xs sm:text-sm text-slate-700 font-medium">
                    🎯 Lock in Activities & Excursions (T-21d)
                  </label>
                </div>

                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="chk-buy-gear"
                    checked={buyGear}
                    onChange={(e) => setBuyGear(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="chk-buy-gear" className="text-xs sm:text-sm text-slate-700 font-medium">
                    🎒 Buy Gear & Equipment for Activities (T-14d)
                  </label>
                </div>
              </div>
            </div>
          )}

          {category === 'birthday_party' && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3.5">
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                  Gift Strategy
                </label>
                <div className="grid grid-cols-3 gap-2.5 text-xs sm:text-sm">
                  <button
                    type="button"
                    onClick={() => setGiftType('group')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      giftType === 'group'
                        ? 'bg-[#0f172a] border-[#0f172a] text-white font-bold shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    🎁 Group Pot (T-30d)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGiftType('solo')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      giftType === 'solo'
                        ? 'bg-[#0f172a] border-[#0f172a] text-white font-bold shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    🛍️ Solo Gift (T-14d)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGiftType('none')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      giftType === 'none'
                        ? 'bg-[#0f172a] border-[#0f172a] text-white font-bold shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    🚫 No Gift
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="chk-themed"
                  checked={isThemed}
                  onChange={(e) => setIsThemed(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                />
                <label htmlFor="chk-themed" className="text-xs sm:text-sm text-slate-700 font-medium">
                  Costume / Themed party (Unlocks T-14d outfit sourcing)
                </label>
              </div>

              {isThemed && (
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Theme name, e.g. 80s Neon, Disco, Masquerade..."
                  className="w-full bg-white text-slate-900 text-sm px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-slate-900"
                />
              )}
            </div>
          )}

          {category === 'hosting_visitors' && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3.5">
              <div className="text-xs font-bold text-slate-900">Select Dining & Meal Plans (Multiple OK)</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="modal-dining-rest"
                    checked={diningRestaurant}
                    onChange={(e) => setDiningRestaurant(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="modal-dining-rest" className="text-xs sm:text-sm text-slate-700 font-medium">
                    🍽️ Restaurant / Pub Dinner Reservations (T-30d)
                  </label>
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="modal-dining-break"
                    checked={diningBreakfastHouse}
                    onChange={(e) => setDiningBreakfastHouse(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="modal-dining-break" className="text-xs sm:text-sm text-slate-700 font-medium">
                    🍳 Breakfast & Coffee In-House Groceries (T-3d)
                  </label>
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="modal-dining-home"
                    checked={diningHomeCooked}
                    onChange={(e) => setDiningHomeCooked(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="modal-dining-home" className="text-xs sm:text-sm text-slate-700 font-medium">
                    🍷 Home-Cooked / Catered Dinners (T-7d)
                  </label>
                </div>
              </div>

              <div className="text-xs font-bold text-slate-900 pt-2 border-t border-slate-200">Select Activities & Entertainment</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="modal-act-tourist"
                    checked={activityTouristSpots}
                    onChange={(e) => setActivityTouristSpots(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="modal-act-tourist" className="text-xs sm:text-sm text-slate-700 font-medium">
                    🗺️ Tourist Spots, City Walks & Museum Tickets (T-14d)
                  </label>
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="modal-act-hiking"
                    checked={activityHiking}
                    onChange={(e) => setActivityHiking(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="modal-act-hiking" className="text-xs sm:text-sm text-slate-700 font-medium">
                    🥾 Hiking Trails & Outdoor Excursions (T-14d)
                  </label>
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="modal-act-games"
                    checked={activityBoardGames}
                    onChange={(e) => setActivityBoardGames(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                  />
                  <label htmlFor="modal-act-games" className="text-xs sm:text-sm text-slate-700 font-medium">
                    🎲 Board Games, Movie Night & Pub Trivia (T-7d)
                  </label>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="modal-stay-guest"
                  checked={stayGuestRoom}
                  onChange={(e) => setStayGuestRoom(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 bg-white"
                />
                <label htmlFor="modal-stay-guest" className="text-xs sm:text-sm text-slate-700 font-medium">
                  🛏️ Guest Room Turnover (Clean Sheets, Towels & Wi-Fi) (T-1d)
                </label>
              </div>
            </div>
          )}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#0f172a] hover:bg-slate-800 text-white px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-sm shadow-slate-900/25 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Generate Milestones</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

import React from 'react';
import { 
  Gift, 
  Sparkles, 
  Car, 
  Utensils, 
  Bed, 
  Tent, 
  Users, 
  Compass, 
  Check, 
  SlidersHorizontal,
  Clock
} from 'lucide-react';
import { CalendarEvent } from '../types';

export interface VariableOption {
  value: string | boolean;
  label: string;
  tMinusInfo: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface VariableGroup {
  key: string;
  title: string;
  icon: React.ReactNode;
  options: VariableOption[];
  currentValue: any;
}

interface EventVariablePickerProps {
  event: CalendarEvent;
  onSelectVariable: (eventId: string, key: string, value: any, label: string) => void;
  isLoading?: boolean;
  compact?: boolean;
}

export const EventVariablePicker: React.FC<EventVariablePickerProps> = ({
  event,
  onSelectVariable,
  isLoading = false,
  compact = false,
}) => {
  const context = event.context || {};
  const category = event.category || 'custom';

  // Build applicable variable groups based on event category
  const groups: VariableGroup[] = [];

  // 1. Gift Strategy (for Birthdays, Celebrations, or General)
  if (category === 'birthday_party' || category === 'custom' || category === 'dinner_social') {
    const currentGift = context.giftType ?? (category === 'birthday_party' ? 'solo' : 'none');
    groups.push({
      key: 'giftType',
      title: 'Gift Strategy',
      icon: <Gift className="w-3.5 h-3.5 text-pink-400" />,
      currentValue: currentGift,
      options: [
        { 
          value: 'group', 
          label: 'Group Gift Pot', 
          tMinusInfo: 'T-30d Pot, T-10d Buy',
          description: 'Team pool & collection',
          icon: <Users className="w-3 h-3 text-pink-400" />
        },
        { 
          value: 'solo', 
          label: 'Solo Gift', 
          tMinusInfo: 'T-14d Order, T-2d Wrap',
          description: 'Direct online order',
          icon: <Gift className="w-3 h-3 text-amber-400" />
        },
        { 
          value: 'none', 
          label: 'No Gift', 
          tMinusInfo: 'Skip gift milestones',
          description: 'No gift required'
        },
      ],
    });
  }

  // 2. Costume & Theme (for Birthdays, Festivals, Parties)
  if (category === 'birthday_party' || category === 'festival_concert' || category === 'custom') {
    const currentThemed = context.isThemed ? 'true' : 'false';
    groups.push({
      key: 'isThemed',
      title: 'Costume & Theme',
      icon: <Sparkles className="w-3.5 h-3.5 text-purple-400" />,
      currentValue: currentThemed,
      options: [
        { 
          value: 'true', 
          label: 'Costume / Themed', 
          tMinusInfo: 'T-14d Outfit Sourcing',
          description: 'Dedicated costume search',
          icon: <Sparkles className="w-3 h-3 text-purple-400" />
        },
        { 
          value: 'false', 
          label: 'Casual / No Theme', 
          tMinusInfo: 'No costume milestone',
          description: 'Standard dress'
        },
      ],
    });
  }

  // 3. Dining & Food Plan (for Hosting, Dinner Social, or General)
  if (category === 'hosting_visitors' || category === 'dinner_social' || category === 'custom') {
    const currentDining = context.diningPlan ?? (category === 'hosting_visitors' ? 'reservations' : 'home');
    groups.push({
      key: 'diningPlan',
      title: 'Dining & Food Strategy',
      icon: <Utensils className="w-3.5 h-3.5 text-amber-400" />,
      currentValue: currentDining,
      options: [
        { 
          value: 'reservations', 
          label: 'Restaurant Tables', 
          tMinusInfo: 'T-30d Table Booking',
          description: 'Advance reservations needed',
          icon: <Utensils className="w-3 h-3 text-amber-400" />
        },
        { 
          value: 'home', 
          label: 'Home Cooking & Drinks', 
          tMinusInfo: 'T-3d Grocery Shopping',
          description: 'Fresh ingredients & snacks'
        },
      ],
    });
  }

  // 4. Guest Room / Hosting Prep (for Hosting Visitors)
  if (category === 'hosting_visitors') {
    const currentGuestRoom = context.guestRoomPrep !== false ? 'true' : 'false';
    groups.push({
      key: 'guestRoomPrep',
      title: 'Guest Room Prep',
      icon: <Bed className="w-3.5 h-3.5 text-emerald-400" />,
      currentValue: currentGuestRoom,
      options: [
        { 
          value: 'true', 
          label: 'Guest Room Prep', 
          tMinusInfo: 'T-1d Fresh Sheets & Towels',
          description: 'Overnight accommodations',
          icon: <Bed className="w-3 h-3 text-emerald-400" />
        },
        { 
          value: 'false', 
          label: 'Day Visit Only', 
          tMinusInfo: 'No room prep needed',
          description: 'No overnight stay'
        },
      ],
    });
  }

  // 5. Festival & Camping (for Festivals, Concerts, Trips)
  if (category === 'festival_concert') {
    const currentCamping = context.isCamping !== false ? 'true' : 'false';
    groups.push({
      key: 'isCamping',
      title: 'Camping & Lodging',
      icon: <Tent className="w-3.5 h-3.5 text-cyan-400" />,
      currentValue: currentCamping,
      options: [
        { 
          value: 'true', 
          label: 'Group Camping Gear', 
          tMinusInfo: 'T-60d Gear Check',
          description: 'Tent, sleeping mats & battery',
          icon: <Tent className="w-3 h-3 text-cyan-400" />
        },
        { 
          value: 'false', 
          label: 'Hotel / Day Pass', 
          tMinusInfo: 'T-14d Ticket Check',
          description: 'Off-site lodging'
        },
      ],
    });
  }

  // 6. Cake & Specialty Food
  if (category === 'birthday_party' || category === 'custom') {
    const currentCake = context.foodOrCake ?? 'none';
    groups.push({
      key: 'foodOrCake',
      title: 'Cake & Specialty Food',
      icon: <Utensils className="w-3.5 h-3.5 text-amber-500" />,
      currentValue: currentCake,
      options: [
        {
          value: 'cake',
          label: 'Custom Bakery Cake',
          tMinusInfo: 'T-7d Order, T-4h Pickup',
          description: 'Custom ordered bakery cake',
          icon: <Utensils className="w-3 h-3 text-amber-500" />
        },
        {
          value: 'reservation',
          label: 'Table Reservation',
          tMinusInfo: 'T-14d Booking',
          description: 'Dining table booking',
          icon: <Utensils className="w-3 h-3 text-amber-500" />
        },
        {
          value: 'homemade',
          label: 'Homemade / Groceries',
          tMinusInfo: 'T-2d Grocery Run',
          description: 'Fresh ingredients & snacks'
        },
        {
          value: 'none',
          label: 'No Special Order',
          tMinusInfo: 'Skip food milestones',
          description: 'Standard arrangement'
        }
      ]
    });
  }

  // 7. Transport & Ride Logistics (universal)
  const currentTransport = context.transportType ?? (context.transportNeeded !== false ? 'taxi' : 'none');
  groups.push({
    key: 'transportType',
    title: 'Transport & Travel Logistics',
    icon: <Car className="w-3.5 h-3.5 text-blue-500" />,
    currentValue: currentTransport,
    options: [
      { 
        value: 'taxi', 
        label: 'Taxi / Rideshare', 
        tMinusInfo: 'T-2h Booking & Route Buffer',
        description: 'Scheduled ride & buffer',
        icon: <Car className="w-3 h-3 text-blue-500" />
      },
      { 
        value: 'carpool', 
        label: 'Carpool / Rental Car', 
        tMinusInfo: 'T-7d Rental, T-2h Departure',
        description: 'Coordinated driving logistics',
        icon: <Car className="w-3 h-3 text-indigo-500" />
      },
      { 
        value: 'transit', 
        label: 'Public Transit', 
        tMinusInfo: 'T-1d Timetable & Ticket Check',
        description: 'Train or bus passes',
        icon: <Compass className="w-3 h-3 text-emerald-500" />
      },
      { 
        value: 'none', 
        label: 'Self Transit / Walk', 
        tMinusInfo: 'No transport milestone',
        description: 'Own arrangement'
      },
    ],
  });

  return (
    <div className={`space-y-3.5 ${compact ? 'text-xs' : ''}`} id={`variable-picker-${event.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <SlidersHorizontal className="w-4 h-4 text-slate-900" />
          <span>Clickable Variables & Lead Time Parameters</span>
        </div>
        <span className="text-xs text-slate-500 font-mono">
          Click any variable to re-tune
        </span>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <div 
            key={group.key} 
            className="bg-white border border-slate-200 rounded-2xl p-3.5 transition-all shadow-xs"
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900">
                {group.icon}
                <span>{group.title}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {group.options.map((opt) => {
                const isSelected = String(group.currentValue) === String(opt.value);

                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    disabled={isLoading}
                    onClick={() => onSelectVariable(event.id, group.key, opt.value, opt.label)}
                    className={`text-left transition-all rounded-xl px-3.5 py-2 border flex flex-col gap-1 group cursor-pointer ${
                      isSelected
                        ? 'bg-slate-100 border-2 border-slate-900 text-slate-900 shadow-xs ring-2 ring-slate-900/10'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isSelected ? (
                        <div className="w-4 h-4 rounded-full bg-[#0f172a] text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        opt.icon
                      )}
                      <span className={`text-xs sm:text-sm font-bold ${isSelected ? 'text-slate-950 font-black' : 'text-slate-800 group-hover:text-slate-950'}`}>
                        {opt.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500 pl-6">
                      <Clock className="w-3 h-3 text-slate-700 shrink-0" />
                      <span className={isSelected ? 'text-slate-900 font-bold' : 'text-slate-500'}>
                        {opt.tMinusInfo}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

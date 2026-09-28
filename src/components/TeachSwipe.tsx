import React, { useRef, useState } from 'react';
import { Check, X, HelpCircle } from 'lucide-react';
import { ENTRY_KIND_LABELS, type EntryKind, type ScanVerdict } from '../utils/eventEligibility';
import { formatDisplayDate } from '../utils/tminusRules';

export interface TeachCard {
  id: string;
  title: string;
  date: string;
  kind: EntryKind;
}

export interface TeachAnswer {
  card: TeachCard;
  /** plan = plan things like this, skip = leave them out, unsure = ask me each time. */
  verdict: ScanVerdict;
  /** The label the user settled on (differs from card.kind when corrected). */
  kind: EntryKind;
}

// What a plan for each kind roughly contains, so "plan this?" is concrete.
const KIND_PLAN: Record<EntryKind, string> = {
  birthday_reminder: 'A card or gift a week before',
  party: 'Gift, invitations, food and drinks',
  trip: 'Travel, stay, documents, packing',
  hosting: 'Guest room, groceries, a plan',
  dinner: 'Book a table, confirm who comes',
  concert: 'Tickets, travel, timing',
  kids_school: 'Forms, outfit, supplies',
  kids_activity: 'Kit, transport, snacks',
  work_deadline: 'Draft, review, final checks',
  subscription: 'A reminder to keep or cancel',
  medical: 'Preparation before the appointment',
  home_car: 'Book, prepare, follow up',
  public_holiday: 'Nothing, unless you host or travel',
  routine: 'Nothing to prepare',
  other: 'A light, general plan',
};

const COMMON_KINDS: EntryKind[] = ['trip', 'party', 'birthday_reminder', 'hosting', 'dinner', 'kids_activity', 'subscription', 'medical', 'home_car', 'routine', 'other'];

/** The guessed label first, then the common ones, Other last. */
function labelChoices(kind: EntryKind): EntryKind[] {
  return Array.from(new Set([kind, ...COMMON_KINDS.filter((k) => k !== 'other'), 'other' as EntryKind]));
}

interface TeachSwipeProps {
  cards: TeachCard[];
  onFinish: (answers: TeachAnswer[]) => void;
  onCancel: () => void;
}

/**
 * "Teach Ahead Of Time": up to 7 cards from the user's own calendar, the
 * entries we're least sure about. Swipe right (or ✓) = plan things like
 * this, left (or ✕) = leave them out, ? = ask me each time. Tapping a label
 * corrects what kind of entry it is. Each answer becomes a rule.
 */
export const TeachSwipe: React.FC<TeachSwipeProps> = ({ cards, onFinish, onCancel }) => {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<TeachAnswer[]>([]);
  const [chosenKind, setChosenKind] = useState<EntryKind>(cards[0]?.kind ?? 'other');
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<null | 'left' | 'right' | 'up'>(null);
  const start = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const card = cards[index];
  const done = index >= cards.length;

  const answer = (verdict: ScanVerdict) => {
    if (!card || leaving) return;
    const next = [...answers, { card, verdict, kind: chosenKind }];
    setLeaving(verdict === 'plan' ? 'right' : verdict === 'skip' ? 'left' : 'up');
    window.setTimeout(() => {
      setAnswers(next);
      setIndex((i) => i + 1);
      setChosenKind(cards[index + 1]?.kind ?? 'other');
      setDx(0);
      setLeaving(null);
    }, 200);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    start.current = e.clientX;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current !== null) setDx(e.clientX - start.current);
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    setDragging(false);
    if (dx > 90) answer('plan');
    else if (dx < -90) answer('skip');
    else setDx(0);
  };

  const transform =
    leaving === 'right'
      ? 'translateX(420px) rotate(18deg)'
      : leaving === 'left'
        ? 'translateX(-420px) rotate(-18deg)'
        : leaving === 'up'
          ? 'translateY(-60px) scale(0.9)'
          : `translateX(${dx}px) rotate(${dx / 20}deg)`;

  return (
    <div className="absolute inset-0 z-20 bg-[#f7f8fa] flex flex-col">
      <div className="px-4 py-3.5 bg-[#182A42] text-white flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-black">Teach Ahead Of Time</h2>
          <p className="text-xs text-slate-300">{done ? 'All done' : 'Should we plan for things like this?'}</p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Stop" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {!done ? (
        <div className="flex-1 flex flex-col p-4 gap-4 min-h-0">
          <div className="flex justify-center gap-1.5" aria-label={`Card ${index + 1} of ${cards.length}`}>
            {cards.map((c, i) => (
              <span key={c.id} className={`h-1.5 w-6 rounded-full ${i < index ? 'bg-[#447463]' : i === index ? 'bg-[#182A42]' : 'bg-slate-200'}`} />
            ))}
          </div>

          <div className="relative flex-1 min-h-[300px]">
            {cards[index + 1] && <div className="absolute inset-0 rounded-3xl bg-white shadow-md scale-95 translate-y-2" aria-hidden="true" />}
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ transform, transition: dragging ? 'none' : 'transform 200ms ease, opacity 200ms ease', opacity: leaving ? 0 : 1, touchAction: 'pan-y' }}
              className="absolute inset-0 rounded-3xl bg-white shadow-xl p-5 flex flex-col justify-between select-none cursor-grab"
            >
              <span
                className="absolute top-4 right-4 px-2 py-0.5 rounded-lg border-[3px] border-[#447463] text-[#447463] font-black text-sm rotate-6"
                style={{ opacity: Math.max(0, dx / 100) }}
                aria-hidden="true"
              >
                PLAN
              </span>
              <span
                className="absolute top-4 left-4 px-2 py-0.5 rounded-lg border-[3px] border-rose-600 text-rose-600 font-black text-sm -rotate-6"
                style={{ opacity: Math.max(0, -dx / 100) }}
                aria-hidden="true"
              >
                SKIP
              </span>
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{formatDisplayDate(card.date)}</p>
                <h3 className="text-2xl font-black text-[#182A42] leading-tight break-words">{card.title}</h3>
                <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-sm">
                  <span className="text-slate-500">We think: </span>
                  <b className="text-[#182A42]">{ENTRY_KIND_LABELS[chosenKind]}</b>
                  <span className="block text-slate-600 text-[13px]">Plan: {KIND_PLAN[chosenKind]}</span>
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What kind of entry is this?">
                  {labelChoices(card.kind).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={chosenKind === k}
                      onClick={() => setChosenKind(k)}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer ${
                        chosenKind === k ? 'bg-[#182A42] text-white border-[#182A42]' : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      {ENTRY_KIND_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">Swipe right to plan things like this, left to leave them out. Wrong label? Tap the right one first.</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 pb-1">
            <button type="button" onClick={() => answer('skip')} aria-label="Leave things like this out" className="w-14 h-14 rounded-full bg-white shadow-md text-rose-600 flex items-center justify-center cursor-pointer">
              <X className="w-6 h-6 stroke-[3]" />
            </button>
            <button type="button" onClick={() => answer('unsure')} aria-label="Ask me each time" className="w-11 h-11 rounded-full bg-white shadow-md text-slate-500 flex items-center justify-center cursor-pointer">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => answer('plan')} aria-label="Plan things like this" className="w-14 h-14 rounded-full bg-aot-sage shadow-md text-[#182A42] flex items-center justify-center cursor-pointer">
              <Check className="w-6 h-6 stroke-[3]" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-center space-y-1 pt-2">
            <p className="text-lg font-black text-[#182A42]">Thanks, that's {answers.length} {answers.length === 1 ? 'rule' : 'rules'}</p>
            <p className="text-xs text-slate-500">This scan and the next ones use them. Change them any time in Settings → Account.</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {answers.map((a) => (
              <div key={a.card.id} className="px-3 py-2 text-xs flex items-center gap-2">
                <span className={`font-bold w-20 shrink-0 ${a.verdict === 'plan' ? 'text-[#447463]' : a.verdict === 'skip' ? 'text-rose-600' : 'text-slate-500'}`}>
                  {a.verdict === 'plan' ? '✓ Plan' : a.verdict === 'skip' ? '✕ Leave out' : '? Ask me'}
                </span>
                <span className="min-w-0">
                  <b className="text-slate-800">{ENTRY_KIND_LABELS[a.kind]}</b>
                  <span className="text-slate-500"> · {a.card.title}</span>
                </span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => onFinish(answers)} className="w-full py-3 rounded-xl bg-[#182A42] text-white text-sm font-bold cursor-pointer">
            Done
          </button>
        </div>
      )}
    </div>
  );
};

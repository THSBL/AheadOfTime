import React, { useState } from 'react';
import { 
  Calendar, 
  Clock, 
  Check, 
  CalendarCheck, 
  Copy, 
  Trash2, 
  Plus, 
  Edit3, 
  Sparkles, 
  MapPin, 
  ArrowRight, 
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  CalendarX,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  MoreHorizontal,
  Layers,
  Repeat,
  X,
  ShoppingBag,
  HelpCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CalendarEvent, TMinusMilestone, IntakeQuestion, PreparationLevel } from '../types';
import { formatDisplayDate, getCountdownStatus, generateICSContent, formatMessagingSummary, getCleanEventTitle, calculateOffsetDate, preserveCompletedMilestones, finalizeMilestonePlan } from '../utils/tminusRules';
import { generateDeterministicMilestones } from '../utils/deterministicMilestoneGenerator';
import { applyPreparationLevelChange } from '../utils/preparationLevelActions';
import { computeOverdueMilestones, computeWeeklyMilestonePreview, isLateFromStart, spreadCatchUpDates } from '../utils/readiness';
import { CatchUpCard } from './CatchUpCard';
import { EditMilestoneModal } from './EditMilestoneModal';
import { GoogleCalendarSync } from './GoogleCalendarSync';
import { DeleteEventModal } from './DeleteEventModal';
import { RefineDeliverableModal } from './RefineDeliverableModal';
import { PreparationLevelSwitcher } from './PreparationLevelSwitcher';
import { getStoredAccessToken } from '../services/googleAuth';
import { deleteSingleMilestoneFromGoogleCalendar } from '../services/googleCalendar';

// Category-specific example so the "SOMETHING OFF?" placeholder feels like
// it's actually about this event, not a hardcoded party-planning example
// shown regardless of context (e.g. on a business trip). A pending
// proactive suggestion always wins when there is one, since that's a real
// question about this exact plan rather than a generic hint.
const CORRECTION_PLACEHOLDER_BY_CATEGORY: Partial<Record<CalendarEvent['category'], string>> = {
  travel_trip: "e.g. Also need to book a rental car",
  booking_trip: "e.g. Also need to book a rental car",
  birthday_party: "e.g. It's just a small dinner, not a big party",
  hosting_visitors: "e.g. They're staying 3 nights, not just one",
  friends_family: "e.g. They're staying 3 nights, not just one",
  festival_concert: "e.g. We already have tickets, just need transport",
  dinner_social: "e.g. Two guests are vegetarian",
  project_deadline: "e.g. Legal review needs to happen first",
  kids_school: "e.g. It's a themed dress-up day",
  kids_hobbies: "e.g. Need to arrange a carpool with another parent",
  maintenance: "e.g. It's a different car this time",
  subscription: "e.g. Actually keep this one, just downgrade the plan",
};

// Human-readable labels matching the "Edit Event Details" category <select>
// options below, used to describe a category change in plain language when
// that edit gets routed through the Gemini correction path.
const EVENT_DETAIL_CATEGORY_LABELS: Partial<Record<CalendarEvent['category'], string>> = {
  birthday_party: 'Wedding / Party / Celebration',
  travel_trip: 'Trip / Travel',
  hosting_visitors: 'Hosting / Visitors',
  dinner_social: 'Dinner / Dining',
  project_deadline: 'Project / Deadline',
  festival_concert: 'Festival / Concert',
  maintenance: 'Maintenance / Service',
  subscription: 'Subscription / Renewal',
  custom: 'General Event',
};

// Auto-generated milestone descriptions that carry no information.
const BOILERPLATE_DESCRIPTION = /^(\d+ deliverable\(s\) attached to satisfy checkpoint\.?|milestone state checkpoint gate|overall trip logistics|specific to this part of the trip)$/i;

// The first follow-up still waiting for an answer - answered ones stay on
// the event only as history, so they're never offered again.
function firstOpenQuestion(questions?: IntakeQuestion[]): IntakeQuestion | null {
  return (questions || []).find((q) => !q.answered && (q.options || []).length > 0) || null;
}

function getCorrectionPlaceholder(event: CalendarEvent | null | undefined, pendingSuggestion: IntakeQuestion | null): string {
  if (pendingSuggestion) {
    return `Answer above, or type your own take on: "${pendingSuggestion.question}"`;
  }
  return (event && CORRECTION_PLACEHOLDER_BY_CATEGORY[event.category]) || "e.g. It's just me and my partner, not a group";
}

interface EventTimelineRadarProps {
  events: CalendarEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string | null) => void;
  onBackToList?: () => void;
  onToggleMilestoneStatus: (eventId: string, milestoneId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onDeleteEventFromCalendarOnly?: (eventId: string, cleanupSummary?: { calCount: number; taskCount: number }) => void;
  onDeleteEventAndCalendar?: (eventId: string, cleanupSummary?: { calCount: number; taskCount: number }) => void;
  onAddCustomMilestone: (eventId: string) => void;
  onUpdateMilestone?: (eventId: string, updatedMilestone: TMinusMilestone) => void;
  onDeleteMilestone?: (eventId: string, milestoneId: string) => void;
  onUpdateEvent?: (updated: CalendarEvent) => void;
  onOpenNewEventModal: () => void;
  onOpenGoogleCalendarSync?: () => void;
  onOpenApplyPreset?: (event: CalendarEvent) => void;
  onSelectVariable?: (eventId: string, key: string, value: any, label: string) => void;
  currentReferenceDate: string;
  isGoogleConnected?: boolean;
  isSyncingWithGoogle?: boolean;
  onTriggerGoogleSync?: () => void;
}

export const EventTimelineRadar: React.FC<EventTimelineRadarProps> = ({
  events,
  selectedEventId,
  onSelectEvent,
  onBackToList,
  onToggleMilestoneStatus,
  onDeleteEvent,
  onDeleteEventFromCalendarOnly,
  onDeleteEventAndCalendar,
  onAddCustomMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onUpdateEvent,
  onOpenNewEventModal,
  onOpenGoogleCalendarSync,
  onOpenApplyPreset,
  currentReferenceDate,
  isGoogleConnected,
  isSyncingWithGoogle,
  onTriggerGoogleSync,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<TMinusMilestone | null>(null);
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [clarifyTitle, setClarifyTitle] = useState('');
  const [clarifyCategory, setClarifyCategory] = useState<any>('custom');
  const [clarifyDate, setClarifyDate] = useState('');
  const [clarifyTime, setClarifyTime] = useState('');
  const [clarifyLocation, setClarifyLocation] = useState('');
  const [isSavingClarification, setIsSavingClarification] = useState(false);
  const [isDeepRefining, setIsDeepRefining] = useState(false);
  const [isPreparationLevelBusy, setIsPreparationLevelBusy] = useState(false);
  const [correctionInput, setCorrectionInput] = useState('');
  const [isSendingCorrection, setIsSendingCorrection] = useState(false);
  const [correctionReply, setCorrectionReply] = useState<string | null>(null);
  // A short running exchange instead of a single reply that gets cleared on
  // the next send - so a proactive follow-up question and the user's answer
  // both stay visible, reading as a continuing conversation rather than one
  // message that vanishes the moment you reply to it.
  const [correctionExchanges, setCorrectionExchanges] = useState<{ text: string; isUser: boolean }[]>([]);
  const [pendingSuggestion, setPendingSuggestion] = useState<IntakeQuestion | null>(null);
  // Open decisions already answered here. Hidden right away so the same
  // chip can't be tapped again (and "added" again) while - or after - the
  // planner works it in.
  const [answeredGapKeys, setAnsweredGapKeys] = useState<Set<string>>(new Set());
  const correctionInFlight = React.useRef(false);
  // Overdue rows are open by default; this holds the ones the user closed.
  const [collapsedOverdueIds, setCollapsedOverdueIds] = useState<Set<string>>(new Set());
  // Collapsed by default - a user happy with the already-balanced plan
  // should see one compact box, not every open question forced on them.
  const [isCorrectionBoxOpen, setIsCorrectionBoxOpen] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'macro' | 'micro'>('all');
  const [expandedMilestoneIds, setExpandedMilestoneIds] = useState<Set<string>>(new Set());

  const toggleMilestoneExpanded = (milestoneId: string) => {
    setExpandedMilestoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  };
  const [refiningDeliverable, setRefiningDeliverable] = useState<TMinusMilestone | null>(null);

  const activeEvent = selectedEventId 
    ? (events.find((e) => e.id === selectedEventId) || events[0] || null) 
    : (events[0] || null);

  const handleDeepRefineWithAI = async () => {
    if (!activeEvent || isDeepRefining || !onUpdateEvent) return;
    setIsDeepRefining(true);
    try {
      const resp = await fetch('/api/event/deep-refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: activeEvent }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.event) {
          onUpdateEvent(data.event);
          confetti({
            particleCount: 50,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#f59e0b', '#0284c7', '#10b981', '#6366f1'],
          });
          return;
        }
      }
      // Fallback local refiner
      const localMilestones = generateDeterministicMilestones({
        eventId: activeEvent.id,
        title: activeEvent.title,
        eventDate: activeEvent.eventDate,
        eventTime: activeEvent.eventTime,
        location: activeEvent.location,
        category: activeEvent.category,
        context: activeEvent.context,
      });
      onUpdateEvent({
        ...activeEvent,
        needsRefinement: false,
        refinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        milestones: localMilestones,
      });
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#0284c7', '#10b981'],
      });
    } catch (e) {
      console.warn('Deep refine fallback notice:', e);
      const localMilestones = generateDeterministicMilestones({
        eventId: activeEvent.id,
        title: activeEvent.title,
        eventDate: activeEvent.eventDate,
        eventTime: activeEvent.eventTime,
        location: activeEvent.location,
        category: activeEvent.category,
        context: activeEvent.context,
      });
      onUpdateEvent({
        ...activeEvent,
        needsRefinement: false,
        refinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        milestones: localMilestones,
      });
      // Best-effort relay into the same quality-signal log the server
      // writes to. Never awaited: a logging failure must not affect this
      // UI flow, which already succeeded via the local fallback above.
      fetch('/api/quality/report-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signalType: 'gemini_error',
          errorDetail: e instanceof Error ? e.message : String(e),
          eventId: activeEvent.id,
        }),
      }).catch(() => {});
    } finally {
      setIsDeepRefining(false);
    }
  };

  // Lets the user correct a fault they spot (a wrong assumption, missing
  // detail, irrelevant task) by typing it as plain text instead of editing
  // milestones one at a time. Routes through the same conversational engine
  // and quality guardrails as chat/Telegram, targeting this specific event.
  // `answer` is set when a suggestion chip was tapped: the question it
  // answers goes along with it, so the planner knows what a bare "Yes" or
  // "Home dinner" refers to (sent alone, it often added nothing).
  const handleSendCorrection = async (
    overrideText?: string,
    answer?: { question: string; intakeAnswer?: { questionId: string; parameterKey: string; answerValue: string }; gapKey?: string }
  ) => {
    const text = (overrideText ?? correctionInput).trim();
    if (!text || !activeEvent || isSendingCorrection || correctionInFlight.current || !onUpdateEvent) return;
    correctionInFlight.current = true;
    setIsSendingCorrection(true);
    setPendingSuggestion(null);
    if (answer?.gapKey) {
      const gapKey = answer.gapKey;
      setAnsweredGapKeys((prev) => new Set(prev).add(gapKey));
    }
    setCorrectionExchanges((prev) => [...prev, { text, isUser: true }]);
    try {
      const res = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: answer ? `${answer.question} ${text}` : text,
          currentReferenceDate,
          activeEvents: [activeEvent],
          targetEventId: activeEvent.id,
          // This box always refines the event it sits on - without this,
          // the model could answer "NEW" and the reply came back under a
          // fresh id that onUpdateEvent (update-by-id) silently discarded.
          lockToTargetEvent: true,
          ...(answer?.intakeAnswer ? { intakeAnswer: answer.intakeAnswer } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();
      if (data?.event) {
        // The model was never told which milestones are already completed
        // (see preserveCompletedMilestones's own doc comment), so a
        // correction touching one part of the plan can otherwise come back
        // with everything reset to pending - silently erasing checked-off
        // progress the user never asked to redo.
        onUpdateEvent({
          ...activeEvent,
          ...data.event,
          id: activeEvent.id,
          milestones: preserveCompletedMilestones(activeEvent.milestones || [], data.event.milestones || [], activeEvent.title),
        });
      }
      const replyText = data.focusText || data.replyText || "Updated based on what you told me.";
      setCorrectionReply(replyText);
      setCorrectionExchanges((prev) => [...prev, { text: replyText, isUser: false }]);
      // The next proactive follow-up the planning engine found (if any) -
      // rendered as clickable chips below. Answered ones are skipped.
      setPendingSuggestion(firstOpenQuestion(data.event?.intakeQuestions));
      setCorrectionInput('');
    } catch (e) {
      console.warn('Text correction notice:', e);
      const failureText = "Couldn't process that just now - please try again.";
      setCorrectionReply(failureText);
      setCorrectionExchanges((prev) => [...prev, { text: failureText, isUser: false }]);
      // Nothing was applied - offer the same choices again.
      setPendingSuggestion(firstOpenQuestion(activeEvent.intakeQuestions));
      if (answer?.gapKey) {
        const gapKey = answer.gapKey;
        setAnsweredGapKeys((prev) => {
          const next = new Set(prev);
          next.delete(gapKey);
          return next;
        });
      }
      // Best-effort relay into the same quality-signal log the server
      // writes to - the browser can't reach Postgres directly. Never
      // awaited: a logging failure must not affect this UI flow.
      fetch('/api/quality/report-client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signalType: 'explicit_failure_reply',
          errorDetail: e instanceof Error ? e.message : String(e),
          rawUserMessage: text,
          eventId: activeEvent.id,
        }),
      }).catch(() => {});
    } finally {
      correctionInFlight.current = false;
      setIsSendingCorrection(false);
    }
  };

  const handleAnswerSuggestion = (question: IntakeQuestion, option: { label: string; value: string }) => {
    handleSendCorrection(option.label, {
      question: question.question,
      intakeAnswer: { questionId: question.id, parameterKey: question.parameterKey, answerValue: option.value },
    });
  };

  /**
   * Architecture reset Phase 6 - a manual preparation-level change. Purely
   * local hide/show (applyPreparationLevelChange) applies instantly and
   * syncs to the server through the app's existing background sync, same
   * as any other local edit - no dedicated endpoint needed. Only when the
   * target tier has no content yet does this reach the server at all,
   * reusing the same /api/agent/process refinement path every other
   * correction already uses (never a bespoke code path). Marking the level
   * user-set here is what makes agentProcessor.ts's sticky-level logic
   * honor exactly this level on that refinement call.
   */
  const handleChangePreparationLevel = async (newLevel: PreparationLevel) => {
    if (!activeEvent || !onUpdateEvent) return;
    const { milestones, needsReplan } = applyPreparationLevelChange(activeEvent.milestones || [], newLevel, activeEvent.planningContextVersion);
    const updatedEvent: CalendarEvent = {
      ...activeEvent,
      milestones,
      preparationLevel: newLevel,
      preparationLevelSetBy: 'user',
      preparationLevelReasons: ['You set this level yourself.'],
      updatedAt: new Date().toISOString(),
    };
    onUpdateEvent(updatedEvent);
    if (!needsReplan) return;

    setIsPreparationLevelBusy(true);
    try {
      const res = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Expand this into a full ${newLevel} preparation plan, given my actual responsibility for this event.`,
          currentReferenceDate,
          activeEvents: [updatedEvent],
          targetEventId: updatedEvent.id,
          // Tells the server this instruction is the app's own, not
          // something the user typed - live-reported bug: without this,
          // the instruction text got folded into stored context and
          // echoed back verbatim as a milestone title ("Travel prep:
          // Expand this into a full extensive preparation plan...").
          isLevelExpansion: true,
        }),
      });
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();
      if (!data?.event?.milestones?.length) throw new Error('Empty milestone plan returned');
      onUpdateEvent({
        ...updatedEvent,
        milestones: preserveCompletedMilestones(updatedEvent.milestones, data.event.milestones, updatedEvent.title),
        preparationLevelReasons: data.event.preparationLevelReasons?.length ? data.event.preparationLevelReasons : updatedEvent.preparationLevelReasons,
      });
    } catch (e) {
      // The local hide/show above already applied and stays in effect -
      // just without this tier's freshly-generated content yet. Never
      // worse than before this feature existed.
      console.warn('Preparation level expand notice:', e);
    } finally {
      setIsPreparationLevelBusy(false);
    }
  };

  React.useEffect(() => {
    if (activeEvent) {
      setClarifyTitle(activeEvent.title);
      setClarifyCategory(activeEvent.category || 'custom');
      setClarifyDate(activeEvent.eventDate || new Date().toISOString().substring(0, 10));
      setClarifyTime(activeEvent.eventTime || '19:00');
      setClarifyLocation(activeEvent.location || '');
      setIsEditingEvent(false);
      setCorrectionInput('');
      setCorrectionReply(null);
      setCorrectionExchanges([]);
      // Pick up a proactive suggestion the event already carries (e.g. the
      // very first one, returned when ChatConsole created this event) -
      // previously reset to null unconditionally, so a follow-up question
      // from creation was silently dropped the moment you landed here.
      setPendingSuggestion(firstOpenQuestion(activeEvent.intakeQuestions));
    }
  }, [activeEvent?.id, activeEvent?.status]);

  // Keyed on the event only: a status change after an answer must not bring
  // an answered decision back.
  React.useEffect(() => {
    setAnsweredGapKeys(new Set());
  }, [activeEvent?.id]);

  const handleSaveClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent || !onUpdateEvent) return;

    const hasExistingMilestones = (activeEvent.milestones || []).length > 0;
    const categoryChanged = clarifyCategory !== activeEvent.category;
    const titleChanged = clarifyTitle.trim() !== activeEvent.title;
    const dateChanged = clarifyDate !== activeEvent.eventDate;
    const timeChanged = (clarifyTime || '') !== (activeEvent.eventTime || '');
    const locationChanged = (clarifyLocation || '') !== (activeEvent.location || '');
    const somethingChanged = categoryChanged || titleChanged || dateChanged || timeChanged || locationChanged;

    // Deterministic fallback: shift each existing milestone's date off its
    // own stored tMinusOffsetMinutes (preserves every custom deliverable,
    // completed checkbox, and previous answer) unless the category itself
    // changed. This is also exactly what runs if the smart path below fails
    // or there's no GEMINI_API_KEY - never worse than before this change.
    const buildFallbackMilestones = (): TMinusMilestone[] => {
      if (!hasExistingMilestones) {
        return generateDeterministicMilestones({
          eventId: activeEvent.id,
          title: clarifyTitle,
          eventDate: clarifyDate,
          eventTime: clarifyTime || '19:00',
          category: clarifyCategory,
          context: activeEvent.context,
        });
      }
      if (!categoryChanged) {
        return activeEvent.milestones.map((ms) => ({
          ...ms,
          calculatedDate: calculateOffsetDate(clarifyDate, clarifyTime || '19:00', ms.tMinusOffsetMinutes),
        }));
      }
      // A category change means the old checklist doesn't map onto the new
      // one, but the old milestones can still carry real progress (completed
      // items, custom deliverables) - merge the new category's template in
      // rather than discarding them outright, same as every other fallback
      // path in the app. Previously this branch called generateHeuristicMilestones
      // alone and returned it directly, silently wiping the old list.
      const freshForNewCategory = generateDeterministicMilestones({
        eventId: activeEvent.id,
        title: clarifyTitle,
        eventDate: clarifyDate,
        eventTime: clarifyTime || '19:00',
        category: clarifyCategory,
        context: activeEvent.context,
      });
      const merged = finalizeMilestonePlan(
        [...activeEvent.milestones, ...freshForNewCategory],
        { title: clarifyTitle, location: clarifyLocation }
      );
      return preserveCompletedMilestones(activeEvent.milestones, merged, clarifyTitle);
    };

    const buildUpdated = (milestones: TMinusMilestone[]): CalendarEvent => ({
      ...activeEvent,
      title: clarifyTitle || activeEvent.title,
      category: clarifyCategory,
      eventDate: clarifyDate,
      // This form has no end-date field of its own, so a multi-day trip's
      // endDate otherwise survived untouched no matter what the start date
      // changed to - confirmed live: moving a Paris trip from Oct to Nov
      // left "Event end date" reading a date before the new start date.
      // Only keep it if it's still a real range against the new start date.
      endDate: activeEvent.endDate && activeEvent.endDate > clarifyDate ? activeEvent.endDate : undefined,
      eventTime: clarifyTime,
      location: clarifyLocation,
      status: 'milestones_active',
      milestones,
      updatedAt: new Date().toISOString(),
    });

    // Nothing worth reconsidering, or nothing to reconsider against - keep
    // this an instant, local-only update exactly like before.
    if (!somethingChanged || !hasExistingMilestones) {
      onUpdateEvent(buildUpdated(buildFallbackMilestones()));
      setIsEditingEvent(false);
      return;
    }

    setIsSavingClarification(true);
    try {
      const changeParts: string[] = [];
      if (titleChanged) changeParts.push(`Changed the event title to "${clarifyTitle}".`);
      if (categoryChanged) changeParts.push(`Changed the category to ${EVENT_DETAIL_CATEGORY_LABELS[clarifyCategory] || clarifyCategory}.`);
      if (dateChanged) changeParts.push(`Changed the event date to ${clarifyDate}.`);
      if (timeChanged) changeParts.push(`Changed the event time to ${clarifyTime}.`);
      if (locationChanged) changeParts.push(clarifyLocation ? `Changed the location to "${clarifyLocation}".` : 'Removed the location.');

      // Send the event with the new fields already applied, not the
      // untouched original - confirmed live that leaving this as
      // `activeEvent` breaks a category change specifically: the
      // deterministic fallback's category detection anchors to
      // `existingEvent.category` first in its if/else-if cascade
      // (`category === 'travel_trip' || message.includes('trip')...`), so a
      // message merely describing a category change in prose never actually
      // flips it - the fallback silently kept generating travel milestones
      // under a "Project / Deadline" event. Pre-applying the new
      // category/title/date/time/location makes both the fallback and
      // Gemini start from the correct category, while `existingMilestones`
      // (still the OLD milestones) is what actually needs reconsidering.
      const draftExistingEvent: CalendarEvent = {
        ...activeEvent,
        title: clarifyTitle || activeEvent.title,
        category: clarifyCategory,
        eventDate: clarifyDate,
        eventTime: clarifyTime,
        location: clarifyLocation,
      };

      const res = await fetch('/api/agent/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: changeParts.join(' '),
          currentReferenceDate,
          activeEvents: [draftExistingEvent],
          targetEventId: activeEvent.id,
        }),
      });
      if (!res.ok) throw new Error(`Server returned status ${res.status}`);
      const data = await res.json();
      if (!data?.event?.milestones?.length) throw new Error('Empty milestone plan returned');

      onUpdateEvent(buildUpdated(preserveCompletedMilestones(activeEvent.milestones || [], data.event.milestones, activeEvent.title)));
    } catch (err) {
      console.warn('Smart event-detail update notice, using local recompute:', err);
      onUpdateEvent(buildUpdated(buildFallbackMilestones()));
    } finally {
      setIsSavingClarification(false);
      setIsEditingEvent(false);
    }
  };

  const handleMilestoneClick = (eventId: string, milestone: TMinusMilestone) => {
    if (milestone.status !== 'completed') {
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.7 },
        colors: ['#e11d48', '#f43f5e', '#10b981', '#3b82f6'],
      });
    }
    onToggleMilestoneStatus(eventId, milestone.id);
  };

  const handleToggleDeliverable = (milestone: TMinusMilestone, deliverableId: string) => {
    if (!activeEvent || !onUpdateMilestone) return;
    const currentDeliverables = milestone.deliverables || [];
    const updatedDeliverables = currentDeliverables.map((d) =>
      d.deliverable_id === deliverableId ? { ...d, is_completed: !d.is_completed } : d
    );

    const allCompleted =
      updatedDeliverables.length > 0 && updatedDeliverables.every((d) => d.is_completed);

    const updatedMilestone: TMinusMilestone = {
      ...milestone,
      deliverables: updatedDeliverables,
      status: allCompleted
        ? 'completed'
        : milestone.status === 'completed' && !allCompleted
        ? 'pending'
        : milestone.status,
    };

    if (allCompleted && milestone.status !== 'completed') {
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.7 },
        colors: ['#182A42', '#529479', '#3b82f6'],
      });
    }

    onUpdateMilestone(activeEvent.id, updatedMilestone);
  };

  const handleCopySchedule = (event: CalendarEvent) => {
    const text = formatMessagingSummary(event);
    navigator.clipboard.writeText(text);
    setCopiedId(event.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadICS = (event: CalendarEvent) => {
    const icsString = generateICSContent(event);
    const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}_Schedule.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveEditedMilestone = (updated: TMinusMilestone) => {
    if (activeEvent && onUpdateMilestone) {
      onUpdateMilestone(activeEvent.id, updated);
    }
    setEditingMilestone(null);
  };

  const handleDeleteTask = (milestoneId: string) => {
    if (activeEvent) {
      const ms = (activeEvent.milestones || []).find((m) => m.id === milestoneId);
      const token = getStoredAccessToken();
      if (token && ms) {
        // Also cleanup this individual milestone from Google Calendar in background
        deleteSingleMilestoneFromGoogleCalendar(token, ms, activeEvent.title).catch((e) => {
          console.warn('Background cleanup of deleted milestone notice:', e);
        });
      }
      if (onDeleteMilestone) {
        onDeleteMilestone(activeEvent.id, milestoneId);
      }
    }
  };

  if (!activeEvent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full milky-glass border border-white/80 rounded-3xl p-6 text-center text-slate-500 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 mb-3 shadow-xs">
          <Calendar className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">No Active Event Selected</h3>
        <p className="text-xs sm:text-sm text-slate-500 mb-4 max-w-xs leading-relaxed">
          Create or select an event from the list to review, adjust, and push its prep schedule.
        </p>
        <button
          onClick={onOpenNewEventModal}
          className="bg-[#182A42] hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm shadow-slate-900/25 transition-all"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Event</span>
        </button>
      </div>
    );
  }

  // Hidden by a preparation-level downgrade (architecture reset Phase 6) -
  // the row still exists (never deleted, so an upgrade can restore it
  // instantly), just not shown anywhere in this view: progress counts,
  // scope filters, and every downstream list all derive from this.
  const rawMilestones = (activeEvent.milestones || []).filter((m) => m.isActive !== false);
  const countdown = getCountdownStatus(activeEvent.eventDate, currentReferenceDate);
  const completedCount = rawMilestones.filter((m) => m.status === 'completed').length;
  // Skipped (e.g. the linked Google Task was deleted) is excluded from the
  // denominator too - it's no longer an outstanding action, so counting it
  // against progress would make "X of Y done" misleadingly low.
  const totalCount = rawMilestones.filter((m) => m.status !== 'skipped').length;
  const hasMicroTasks = rawMilestones.some((m) => m.scope === 'micro');
  const microCount = rawMilestones.filter((m) => m.scope === 'micro').length;
  // One combined count for the "N suggestions from us" toggle: the AI's own
  // one-off proactive follow-up plus every still-open decision.
  const openGaps = (activeEvent.outstandingGaps || []).filter((gap) => !answeredGapKeys.has(gap.key));
  const suggestionCount = (pendingSuggestion ? 1 : 0) + openGaps.length;
  // Always starts collapsed, even when a suggestion is waiting - live
  // feedback was that auto-opening the moment a suggestion existed still
  // felt like the box "popped open on its own." The collapsed pill's own
  // label below surfaces the count instead, so the suggestion is still
  // discoverable without the box expanding itself.
  const isCorrectionBoxExpanded = isCorrectionBoxOpen;
  const macroCount = totalCount - microCount;

  const displayedMilestones = rawMilestones.filter((ms) => {
    if (scopeFilter === 'all') return true;
    if (scopeFilter === 'macro') return ms.scope !== 'micro';
    if (scopeFilter === 'micro') return ms.scope === 'micro';
    return true;
  });

  // Group into the same Overdue / This week / Looking-ahead sections the "My
  // Week Ahead" dashboard uses (src/utils/readiness.ts), instead of this
  // file's own, older Overdue/Due Soon/Upcoming/Done split - one algorithm
  // decides "what counts as overdue / this week / which week" everywhere in
  // the app. Unlike the dashboard's 4-week-capped triage view, this is the
  // full one-event deep-dive, so nothing is capped - every future week with
  // an item gets shown. A synthetic single-event array (milestones replaced
  // with the scope-filtered `displayedMilestones`) keeps the existing scope
  // filter (all/macro/micro) working exactly as before.
  const milestonesById = new Map<string, TMinusMilestone>(displayedMilestones.map((ms) => [ms.id, ms]));
  const syntheticEvents = [{ ...activeEvent, milestones: displayedMilestones }];
  const overdueItems = computeOverdueMilestones(syntheticEvents, currentReferenceDate)
    .map((item) => milestonesById.get(item.milestoneId))
    .filter((ms): ms is TMinusMilestone => Boolean(ms));
  const weeklyPreview = computeWeeklyMilestonePreview(syntheticEvents, currentReferenceDate);
  // Due before this event was added: a one-time "already done?" check, not
  // overdue work (see isLateFromStart).
  const catchUpMilestones = displayedMilestones.filter((ms) => isLateFromStart(ms, activeEvent));
  const markCatchUpDone = (ids: string[]) => {
    if (!onUpdateMilestone) return;
    const completedAt = new Date().toISOString();
    for (const id of ids) {
      const ms = milestonesById.get(id);
      if (ms) onUpdateMilestone(activeEvent.id, { ...ms, status: 'completed', completedAt });
    }
  };
  const planCatchUpRest = (ids: string[]) => {
    if (!onUpdateMilestone) return;
    const dates = spreadCatchUpDates(ids.length, activeEvent.eventDate, currentReferenceDate);
    ids.forEach((id, index) => {
      const ms = milestonesById.get(id);
      if (ms) onUpdateMilestone(activeEvent.id, { ...ms, calculatedDate: dates[index] });
    });
  };
  const thisWeekBucket = weeklyPreview.find((bucket) => bucket.key === 'week-0');
  // Looking ahead is a flat, always-open scan of everything beyond this
  // week - no week split, no topic clustering - so it's one merged,
  // date-ordered list rather than the nested per-week buckets themselves.
  const futureItems = weeklyPreview
    .filter((bucket) => bucket.key !== 'week-0')
    .flatMap((bucket) => bucket.items)
    .map((item) => milestonesById.get(item.milestoneId))
    .filter((ms): ms is TMinusMilestone => Boolean(ms))
    .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate));
  const doneMilestones = displayedMilestones.filter((ms) => ms.status === 'completed' || ms.status === 'skipped');

  // One compact row per task (no left-border accent, no category badges) -
  // clickable to unfold sub-tasks or
  // a description when there's more to a title than fits on one line (e.g.
  // "Budget & expenses" alone doesn't say what that actually covers).
  // Also used for Overdue / This week / Done (they were full cards with a
  // coloured left border, badge, date line, category tag and sub-task line
  // each - too much competing for attention). `tone` only changes the
  // countdown label's colour: rose for overdue, darker for this week.
  const renderCompactFutureRow = (ms: TMinusMilestone, tone: 'overdue' | 'week' | 'future' = 'future') => {
    const isCompleted = ms.status === 'completed';
    const isSkipped = ms.status === 'skipped';
    const msCountdown = getCountdownStatus(ms.calculatedDate, currentReferenceDate);
    const hasDeliverables = Boolean(ms.deliverables && ms.deliverables.length > 0);
    // Filler text the planner used to attach ("2 deliverable(s) attached to
    // satisfy checkpoint.") says nothing - only real descriptions show.
    const hasDescription = Boolean(ms.description && ms.description.trim() && !BOILERPLATE_DESCRIPTION.test(ms.description.trim()));
    const isExpandable = hasDeliverables || hasDescription;
    // Overdue tasks start open: their personalised sub-tasks are what
    // needs doing now. Other sections start closed.
    const isExpanded = tone === 'overdue' ? !collapsedOverdueIds.has(ms.id) : expandedMilestoneIds.has(ms.id);
    const toggleExpanded = () => {
      if (tone !== 'overdue') return toggleMilestoneExpanded(ms.id);
      setCollapsedOverdueIds((prev) => {
        const next = new Set(prev);
        if (next.has(ms.id)) next.delete(ms.id);
        else next.add(ms.id);
        return next;
      });
    };
    const completedDelivCount = hasDeliverables ? ms.deliverables!.filter((d) => d.is_completed).length : 0;

    return (
      <div
        key={ms.id}
        // Was its own individually-rounded, bordered card with a gap
        // before the next one - live feedback wanted "less separate
        // elements creating disturbance." Now a flat row inside the
        // shared container (see the "Looking ahead" call site), styled
        // only by its own text color and a hover tint.
        className={`group transition-all ${
          isSkipped
            ? 'text-slate-400 opacity-70'
            : isCompleted
            ? 'text-slate-400'
            : 'text-slate-700 hover:bg-slate-50/80'
        }`}
      >
        <div
          className={`flex items-start sm:items-center gap-2 px-2.5 py-1.5 ${isExpandable ? 'cursor-pointer' : ''}`}
          onClick={() => isExpandable && toggleExpanded()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              !isSkipped && handleMilestoneClick(activeEvent.id, ms);
            }}
            disabled={isSkipped}
            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all ${
              isSkipped
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : isCompleted
                ? 'bg-aot-sage text-[#182A42] cursor-pointer'
                : 'border-2 border-slate-300 hover:border-[#182A42] text-transparent cursor-pointer'
            }`}
            title={isSkipped ? 'Skipped - removed in Google Tasks' : isCompleted ? 'Mark as pending' : 'Mark as completed'}
          >
            {isSkipped ? <X className="w-2.5 h-2.5 stroke-[3]" /> : <Check className="w-2.5 h-2.5 stroke-[3]" />}
          </button>

          {/* Phones: the title gets the full width (up to two lines) with
              Refine and the countdown on a small line below - on one line
              they squeezed the title down to a few characters. Desktop
              keeps everything on one row. */}
          <div className="flex-1 min-w-0 sm:flex sm:items-center sm:gap-2">
            <span className={`block text-xs font-semibold leading-snug line-clamp-2 sm:line-clamp-none sm:truncate sm:flex-1 sm:min-w-0 ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
              {ms.title}
            </span>
            <div className="flex items-center gap-2 mt-0.5 sm:mt-0 shrink-0 empty:hidden">
              {!isCompleted && !isSkipped && (ms.needsRefinement || (ms.refinementOptions && ms.refinementOptions.length > 0)) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRefiningDeliverable(ms);
                  }}
                  className="text-[10px] font-bold text-amber-800 hover:text-amber-950 flex items-center gap-0.5 transition-all cursor-pointer shrink-0"
                  title="Refine specifics for this task"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Refine</span>
                </button>
              )}
              {!isCompleted && !isSkipped && (
                <span className={`text-[10px] font-bold shrink-0 ${
                  tone === 'overdue' ? 'text-rose-600' : tone === 'week' ? 'text-slate-600' : 'text-slate-400'
                }`}>{msCountdown.label}</span>
              )}
              {/* Exact calendar date - desktop only, de-emphasized behind the
                  title and "in x days" label, same convention as the main
                  milestone card. */}
              <span className="hidden sm:inline text-[10px] font-mono font-bold text-slate-400 shrink-0 whitespace-nowrap">
                {formatDisplayDate(ms.calculatedDate)}
              </span>
            </div>
          </div>

          {/* Makes it visible there is more behind a row: the sub-task
              count plus a clear chevron, instead of a faint arrow only. */}
          {isExpandable && (
            <span
              className={`flex items-center gap-1 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors ${
                isExpanded ? 'text-slate-500' : 'text-slate-600 bg-slate-100 group-hover:bg-slate-200/80'
              }`}
              aria-label={isExpanded ? 'Hide details' : 'Show details'}
            >
              {hasDeliverables && <span className="font-mono">{completedDelivCount}/{ms.deliverables!.length}</span>}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </span>
          )}

          {/* Edit/delete stay inline with the date/title row, at every
              breakpoint, so unfolding sub-tasks below never pushes them
              anywhere else or adds a second row just for them. */}
          <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingMilestone(ms);
              }}
              className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-sky-50 transition-all cursor-pointer"
              title="Edit task date, topic, or description"
            >
              <Edit3 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteTask(ms.id);
              }}
              className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
              title="Delete this task"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="px-2.5 pb-2 pl-9 space-y-1.5 -mt-0.5">
            {hasDescription && (
              <p className="text-[11px] text-slate-500 leading-relaxed">{ms.description}</p>
            )}
            {hasDeliverables && (
              <div className="space-y-1">
                {ms.deliverables!.map((deliv) => {
                  const isDelivDone = deliv.is_completed;
                  return (
                    <div
                      key={deliv.deliverable_id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleDeliverable(ms, deliv.deliverable_id);
                      }}
                      className="flex items-start gap-2 py-0.5 cursor-pointer group/deliv"
                    >
                      <button
                        type="button"
                        className={`w-3.5 h-3.5 mt-0.5 rounded flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                          isDelivDone
                            ? 'bg-[#182A42] text-white'
                            : 'border border-slate-300 group-hover/deliv:border-[#182A42] text-transparent'
                        }`}
                        title={isDelivDone ? 'Mark sub-task as pending' : 'Mark sub-task as complete'}
                      >
                        <Check className="w-2 h-2 stroke-[3]" />
                      </button>
                      <span className={`text-[11px] leading-snug break-words ${isDelivDone ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                        {deliv.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Push to Cal + the More menu: in the sticky bar on mobile, beside the
  // title from lg up.
  const renderEventActions = () => (
    <div className="flex items-center gap-1.5 shrink-0 relative">
      <button
        onClick={() => setIsPushModalOpen(true)}
        className="bg-aot-sage hover:bg-aot-sage-hover text-[#182A42] text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer"
        title="Push 1 event + prep tasks to Google Calendar"
      >
        <Calendar className="w-3.5 h-3.5 text-[#182A42] shrink-0" />
        <span>Push to Cal</span>
      </button>

      {/* More Actions Menu */}
      <div className="relative">
        <button
          onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
          className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs flex items-center justify-center transition-all cursor-pointer"
          title="More event actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {isMoreMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsMoreMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
              {onOpenApplyPreset && (
                <button
                  onClick={() => {
                    onOpenApplyPreset(activeEvent);
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-purple-50 hover:text-purple-950 flex items-center gap-2 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-purple-600" />
                  <span>Import Template Preset...</span>
                </button>
              )}

              <button
                onClick={() => {
                  handleDownloadICS(activeEvent);
                  setIsMoreMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-slate-900 flex items-center gap-2 cursor-pointer"
              >
                <CalendarCheck className="w-3.5 h-3.5 text-sky-600" />
                <span>Download .ICS File</span>
              </button>

              <button
                onClick={() => {
                  const summary = formatMessagingSummary(activeEvent);
                  navigator.clipboard.writeText(summary);
                  setCopiedId(activeEvent.id);
                  setTimeout(() => setCopiedId(null), 2000);
                  setIsMoreMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-slate-900 flex items-center gap-2 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>{copiedId === activeEvent.id ? 'Copied Summary!' : 'Copy Summary'}</span>
              </button>

              <button
                onClick={() => {
                  setClarifyTitle(activeEvent.title);
                  setClarifyCategory(activeEvent.category || 'custom');
                  setClarifyDate(activeEvent.eventDate);
                  setClarifyTime(activeEvent.eventTime || '');
                  setClarifyLocation(activeEvent.location || '');
                  setIsEditingEvent(true);
                  setIsMoreMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50 hover:text-slate-900 flex items-center gap-2 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit Event Details</span>
              </button>

              <div className="border-t border-slate-100 my-1" />

              <button
                onClick={() => {
                  setIsDeleteModalOpen(true);
                  setIsMoreMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete Event...</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full milky-glass border border-sky-200/80 rounded-3xl overflow-hidden shadow-xs w-full">
      
      {/* Mobile Sticky Navigation Header (State 2: Detail View) */}
      {onBackToList && (
        <div className="lg:hidden flex items-center justify-between px-3 py-2 bg-white/95 border-b border-sky-200/90 backdrop-blur-md sticky top-0 z-30">
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-sky-300" />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-1.5 min-w-0">
            {renderEventActions()}
            <span className="text-[11px] font-mono font-bold text-slate-700 bg-sky-50 border border-sky-200/90 px-2 py-0.5 rounded-lg shrink-0">
              {completedCount}/{totalCount}
            </span>
          </div>
        </div>
      )}

      {/* Header with Event Details & Actions */}
      <div className="p-3 sm:p-4 bg-white/80 border-b border-sky-100/90 backdrop-blur-md space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Title & Metadata */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm sm:text-lg font-black text-slate-900 tracking-tight leading-snug break-words">
                {getCleanEventTitle(activeEvent.title, activeEvent.category, activeEvent.context)}
              </h3>
              {activeEvent.needsRefinement && !activeEvent.refinedAt && (!activeEvent.context || Object.keys(activeEvent.context).length === 0) && (
                <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span>Needs review</span>
                </span>
              )}
              {(activeEvent.recurrence?.isRecurring || activeEvent.context?.isRecurring) && (
                <span className="text-[10px] font-bold text-sky-950 bg-sky-100/90 px-2 py-0.5 rounded-full border border-sky-300 shadow-2xs flex items-center gap-1 shrink-0">
                  <Repeat className="w-2.5 h-2.5 text-sky-700 shrink-0" />
                  <span>{activeEvent.recurrence?.recurrencePatternText || activeEvent.context?.recurrencePatternText || 'Recurring'}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 text-xs text-slate-600 flex-wrap">
              <div className="flex items-center gap-1 font-semibold text-slate-800">
                <Calendar className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                <span>
                  {activeEvent.endDate || activeEvent.macroEvent?.end_date
                    ? `${formatDisplayDate(activeEvent.eventDate)} – ${formatDisplayDate(activeEvent.endDate || activeEvent.macroEvent?.end_date || '')}`
                    : formatDisplayDate(activeEvent.eventDate)
                  }
                </span>
              </div>
              {activeEvent.eventTime && (
                <div className="flex items-center gap-1 font-mono text-slate-500 text-[11px]">
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{activeEvent.eventTime}</span>
                </div>
              )}
              {activeEvent.location && (
                <div className="flex items-center gap-1 text-slate-500 text-[11px] truncate max-w-[150px] sm:max-w-none">
                  <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{activeEvent.location}</span>
                </div>
              )}
              {countdown.isOverdue ? (
                <span className="text-[10px] font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-300 shadow-2xs flex items-center gap-1 shrink-0">
                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                  <span>{countdown.label}</span>
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold text-sky-900 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200 shadow-2xs shrink-0">
                  {countdown.label}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons: Compact row with More menu (in the sticky
              bar instead on mobile, to keep this header light) */}
          <div className={onBackToList ? 'hidden lg:block' : ''}>{renderEventActions()}</div>
        </div>

        {/* Progress: percentage as its own prominent number (not just
            buried in "N of M"), a full-width bar, then completion count and
            the plan-level switcher sharing one caption row - previously the
            switcher sat on its own line below with an info icon + Change
            link, competing for attention right under the bar instead of
            reading as this row's own secondary detail. */}
        {/* Mobile (sticky bar shows the N/M count): one quiet line - a thin
            bar plus the plan-level switcher. */}
        {onBackToList && (
          <div className="lg:hidden flex items-center gap-3">
            <div className="flex-1 h-1 bg-sky-100 rounded-full overflow-hidden" aria-hidden="true">
              <div
                className="h-full bg-slate-900 rounded-full transition-all duration-300"
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
            <PreparationLevelSwitcher
              level={activeEvent.preparationLevel || 'balanced'}
              onChangeLevel={handleChangePreparationLevel}
              isBusy={isPreparationLevelBusy}
            />
          </div>
        )}
        <div className={`space-y-1 pt-0.5 ${onBackToList ? 'hidden lg:block' : ''}`}>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span className="uppercase tracking-wider">Preparation</span>
            <span className="font-mono text-slate-900 font-bold text-sm">
              {totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-sky-100 rounded-full overflow-hidden border border-sky-200/40">
            <div
              className="h-full bg-slate-900 rounded-full transition-all duration-300 shadow-2xs"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[11px] font-mono text-slate-500 font-medium">{completedCount} of {totalCount} completed</span>
            <PreparationLevelSwitcher
              level={activeEvent.preparationLevel || 'balanced'}
              onChangeLevel={handleChangePreparationLevel}
              isBusy={isPreparationLevelBusy}
            />
          </div>
        </div>
      </div>

      {/* Main Prep Tasks List (Review, Edit, Delete, Adjust Date) */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-2.5 bg-sky-50/20 w-full">
        <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider px-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-700">Prep Tasks ({totalCount})</span>
            <span className="text-[10px] font-normal text-slate-400 lowercase hidden sm:inline">• click task to edit</span>
          </div>
          <button
            onClick={() => onAddCustomMilestone(activeEvent.id)}
            className="text-slate-500 hover:text-slate-900 px-1.5 py-0.5 flex items-center gap-1 text-[11px] font-bold transition-all cursor-pointer border-b border-transparent hover:border-slate-300"
          >
            <Plus className="w-3 h-3 stroke-[2.5]" />
            <span>Add Task</span>
          </button>
        </div>

        {/* Freeform correction box: spotted something wrong or missing?
            Type it instead of hand-editing each task - this goes through
            the same conversational engine and quality guardrails as chat
            or Telegram, targeting this specific event. Collapsed to a
            single pill by default, always - live feedback was that the
            full box (heading, input, send button) sat there permanently
            even with nothing to act on, and later that auto-opening it the
            moment a suggestion existed still felt like it "popped open on
            its own." The collapsed pill's own chevron signals it expands,
            and its label picks up the suggestion count when there is one,
            so a live suggestion is still visible without the box actually
            opening until tapped. */}
        {onUpdateEvent && !isCorrectionBoxExpanded && (
          <button
            type="button"
            onClick={() => setIsCorrectionBoxOpen(true)}
            // Suggestions waiting get a faint warm tint so they're noticed
            // without shouting; with none, it stays a plain text row.
            className={`w-full flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              suggestionCount > 0
                ? 'text-amber-900/80 hover:text-amber-950 bg-amber-50/70 hover:bg-amber-50 border border-amber-200/60 rounded-xl px-2.5 py-1.5'
                : 'text-slate-500 hover:text-slate-800 px-1 py-1'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 shrink-0 ${suggestionCount > 0 ? 'text-amber-600' : 'text-sky-600'}`} />
            <span className="flex-1 text-left">
              {suggestionCount > 0
                ? `${suggestionCount} suggestion${suggestionCount > 1 ? 's' : ''} from us`
                : 'Want to add or change something?'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${suggestionCount > 0 ? 'text-amber-700/70' : 'text-slate-400'}`} />
          </button>
        )}
        {onUpdateEvent && isCorrectionBoxExpanded && (
          <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>Want to add or change something?</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCorrectionBoxOpen(false)}
                aria-label="Hide"
                className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={correctionInput}
                onChange={(e) => setCorrectionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendCorrection();
                  }
                }}
                placeholder={getCorrectionPlaceholder(activeEvent, pendingSuggestion)}
                disabled={isSendingCorrection}
                className="flex-1 min-w-0 text-xs font-medium px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => handleSendCorrection()}
                disabled={isSendingCorrection || !correctionInput.trim()}
                className="shrink-0 text-xs font-bold px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isSendingCorrection ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Send</span>
                )}
              </button>
            </div>
            {isSendingCorrection && (
              <p className="text-[11px] text-sky-700 font-semibold leading-snug border-t border-slate-100 pt-2 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                <span>Thinking through your plan…</span>
              </p>
            )}
            {!isSendingCorrection && correctionExchanges.length > 0 && (
              <div className="border-t border-slate-100 pt-2 space-y-1.5">
                {correctionExchanges.map((exchange, idx) => (
                  <p
                    key={idx}
                    className={`text-[11px] font-medium leading-snug ${
                      exchange.isUser ? 'text-slate-500 italic' : 'text-slate-700'
                    }`}
                  >
                    {exchange.isUser ? `“${exchange.text}”` : exchange.text}
                  </p>
                ))}
              </div>
            )}
            {!isSendingCorrection && suggestionCount > 0 && (
              <div className="pt-1 border-t border-amber-100/80">
                {/* No longer its own nested collapse/expand toggle - the
                    outer box's own visibility already means "there's
                    something to show," so a second click to reveal it was
                    a redundant extra step. */}
                <div className="w-full flex items-center gap-1.5 py-1 text-[11px] font-bold text-slate-700">
                  <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{suggestionCount} suggestion{suggestionCount > 1 ? 's' : ''} from us</span>
                </div>

                  <div className="mt-1 space-y-3">
                    {pendingSuggestion && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-amber-800">{pendingSuggestion.question}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(pendingSuggestion.options || []).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleAnswerSuggestion(pendingSuggestion, opt)}
                              className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200 transition-all cursor-pointer"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Open Decisions - architecture reset Phase 8. Everything
                        still genuinely undecided on this event (role gap or
                        any milestone/deliverable flagged needsRefinement),
                        recomputed fresh every turn so nothing sits silently
                        unanswered forever. Folded into this one collapsible
                        panel (rather than its own always-visible banner) so
                        a user happy with the plan sees one compact box. */}
                    {openGaps.map((gap) => (
                      <div key={gap.key} className="space-y-1.5">
                        <p className="text-[11px] font-bold text-slate-700">{gap.question}</p>
                        {gap.options && gap.options.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {gap.options.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleSendCorrection(opt, { question: gap.question, gapKey: gap.key })}
                                className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200 transition-all cursor-pointer"
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500">Answer above to resolve this.</p>
                        )}
                      </div>
                    ))}
                  </div>
              </div>
            )}
          </div>
        )}

        {/* Scope Filter Buttons if Hierarchical Tasks exist */}
        {hasMicroTasks && (
          <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-xl text-xs font-bold w-fit">
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                scopeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('macro')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                scopeFilter === 'macro'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Preparation ({macroCount})
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter('micro')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                scopeFilter === 'micro'
                  ? 'bg-white text-indigo-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day-Of Tasks ({microCount})
            </button>
          </div>
        )}

        {isEditingEvent ? (
          <div className="bg-white border border-sky-300 rounded-3xl p-5 shadow-lg space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-200 flex items-center justify-center text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">Needs Clarification &amp; Details</h4>
                  <p className="text-[11px] text-slate-500">Specify details for this event to auto-generate the complete prep checklist.</p>
                </div>
              </div>
              {rawMilestones.length > 0 && (
                <button
                  onClick={() => setIsEditingEvent(false)}
                  className="text-xs text-slate-400 hover:text-slate-700 font-bold px-2.5 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleSaveClarification} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Event Title / Description</label>
                <input
                  type="text"
                  required
                  value={clarifyTitle}
                  onChange={(e) => setClarifyTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Category</label>
                  <select
                    value={clarifyCategory}
                    onChange={(e) => setClarifyCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800 cursor-pointer"
                  >
                    <option value="birthday_party">🎉 Wedding / Party / Celebration</option>
                    <option value="travel_trip">✈️ Trip / Travel</option>
                    <option value="hosting_visitors">🏡 Hosting / Visitors</option>
                    <option value="dinner_social">🍽️ Dinner / Dining</option>
                    <option value="project_deadline">🚀 Project / Deadline</option>
                    <option value="festival_concert">🎵 Festival / Concert</option>
                    <option value="maintenance">🔧 Maintenance / Service</option>
                    <option value="subscription">💳 Subscription / Renewal</option>
                    <option value="custom">📅 General Event</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Event Date</label>
                  <input
                    type="date"
                    required
                    value={clarifyDate}
                    onChange={(e) => setClarifyDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Time</label>
                  <input
                    type="time"
                    value={clarifyTime}
                    onChange={(e) => setClarifyTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Location / Venue</label>
                  <input
                    type="text"
                    value={clarifyLocation}
                    onChange={(e) => setClarifyLocation(e.target.value)}
                    placeholder="e.g. Italian Restaurant, Home..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="submit"
                  disabled={isSavingClarification}
                  className="px-5 py-2.5 rounded-xl bg-[#182A42] hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  {isSavingClarification ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-sky-300 animate-spin" />
                      <span>Reconsidering plan...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                      <span>Build Ahead Of Time Milestones</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : rawMilestones.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs sm:text-sm bg-white rounded-2xl border border-sky-200/80 space-y-3 shadow-xs">
            <p>No preparation tasks created for this event yet.</p>
            <button
              onClick={() => onAddCustomMilestone(activeEvent.id)}
              className="px-4 py-2 bg-[#182A42] text-white rounded-xl text-xs font-bold shadow-xs hover:bg-slate-800 cursor-pointer"
            >
              Add First Task
            </button>
          </div>
        ) : displayedMilestones.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs sm:text-sm bg-white rounded-2xl border border-sky-100 space-y-2 shadow-xs">
            <p>No tasks found for "{scopeFilter === 'micro' ? 'Day-Of Tasks' : 'Preparation'}".</p>
            <button
              onClick={() => setScopeFilter('all')}
              className="px-3 py-1 bg-sky-50 text-sky-900 rounded-lg text-xs font-bold hover:bg-sky-100 cursor-pointer border border-sky-200"
            >
              Show All Tasks
            </button>
          </div>
        ) : (
          <>
            {catchUpMilestones.length > 0 && onUpdateMilestone && (
              <CatchUpCard
                eventTitle={activeEvent.title}
                items={catchUpMilestones.map((ms) => ({ milestoneId: ms.id, title: ms.title }))}
                hideEventTitle
                onMarkDone={markCatchUpDone}
                onPlanRest={planCatchUpRest}
              />
            )}

            {/* Overdue - flat and fully detailed, never folded into a topic,
                since this is exactly what needs attention right now. */}
            {overdueItems.length > 0 && (
              <React.Fragment>
                <div className="flex items-center gap-2 px-1 pt-1 first:pt-0">
                  <span className="text-[11px] font-black uppercase tracking-wide text-rose-600 shrink-0">Overdue</span>
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] font-mono font-bold text-rose-800 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full shrink-0">
                    {overdueItems.length}
                  </span>
                </div>
                <div className="rounded-xl bg-white border border-rose-200/80 shadow-2xs divide-y divide-slate-100">
                  {overdueItems.map((ms) => renderCompactFutureRow(ms, 'overdue'))}
                </div>
              </React.Fragment>
            )}

            {/* This week - same flat treatment, directly follows Overdue so
                "what's late" and "what's due this week" read as one
                continuous focus zone. */}
            {thisWeekBucket && (
              <React.Fragment>
                <div className="flex items-center gap-2 px-1 pt-1 first:pt-0">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-400 shrink-0">This week</span>
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full shrink-0">
                    {thisWeekBucket.items.length}
                  </span>
                </div>
                <div className="rounded-xl bg-white border border-slate-200/90 shadow-2xs divide-y divide-slate-100">
                  {thisWeekBucket.items.map((item) => {
                    const ms = milestonesById.get(item.milestoneId);
                    return ms ? renderCompactFutureRow(ms, 'week') : null;
                  })}
                </div>
              </React.Fragment>
            )}

            {/* Looking ahead - flat and always open: every future milestone
                in date order, no week split and no topic nesting. This is
                the "did I miss a prep step" scan, not a drill-down, so
                rows are deliberately compact/inline rather than the full
                Overdue/This week card. */}
            {futureItems.length > 0 && (
              <React.Fragment>
                <div className="flex items-center gap-2 px-1 pt-1 first:pt-0">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-400 shrink-0">Looking ahead</span>
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full shrink-0">
                    {futureItems.length}
                  </span>
                </div>
                <div className="rounded-xl bg-white border border-slate-200/90 shadow-2xs divide-y divide-slate-100">
                  {futureItems.map((ms) => renderCompactFutureRow(ms))}
                </div>
              </React.Fragment>
            )}

            {/* Done - same compact rows (struck through). */}
            {doneMilestones.length > 0 && (
              <React.Fragment>
                <div className="flex items-center gap-2 px-1 pt-1 first:pt-0">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-400 shrink-0">Done</span>
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full shrink-0">
                    {doneMilestones.length}
                  </span>
                </div>
                <div className="rounded-xl bg-white border border-slate-200/90 shadow-2xs divide-y divide-slate-100">
                  {doneMilestones.map((ms) => renderCompactFutureRow(ms))}
                </div>
              </React.Fragment>
            )}
          </>
        )}

        {/* Event Date Summary Box - stacked and left-aligned on mobile
            (a long title plus two right-aligned date lines had nowhere to
            go on a narrow screen and ended up misaligned/wrapping badly);
            side-by-side with right-aligned dates from sm: up. */}
        <div className={`mt-4 p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 text-xs sm:text-sm shadow-xs ${
          countdown.isOverdue
            ? 'bg-rose-50/70 border-rose-300 text-rose-950'
            : 'bg-white border-sky-200/80 text-slate-700'
        }`}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className={`w-3 h-3 rounded-full shadow-2xs shrink-0 ${countdown.isOverdue ? 'bg-rose-600 ring-2 ring-rose-200' : 'bg-[#182A42]'}`} />
            <div>
              <span className="font-bold text-slate-900">{getCleanEventTitle(activeEvent.title, activeEvent.category, activeEvent.context)}</span>
              {activeEvent.eventTime && <span className="text-slate-500 text-xs ml-2">({activeEvent.eventTime})</span>}
              {countdown.isOverdue && (
                <span className="ml-2 font-mono font-bold text-rose-700 text-xs bg-rose-100 px-2.5 py-0.5 rounded-full border border-rose-300 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                  <span>{countdown.label}</span>
                </span>
              )}
            </div>
          </div>
          <div className="text-left sm:text-right pl-5 sm:pl-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-1.5">Event start date</span>
              <span className={`font-mono font-bold ${countdown.isOverdue ? 'text-rose-700' : 'text-slate-900'}`}>
                {formatDisplayDate(activeEvent.eventDate)}
              </span>
            </div>
            {(activeEvent.endDate || activeEvent.macroEvent?.end_date) &&
              (activeEvent.endDate || activeEvent.macroEvent?.end_date) !== activeEvent.eventDate && (
              <div className="mt-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-1.5">Event end date</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatDisplayDate(activeEvent.endDate || activeEvent.macroEvent?.end_date || '')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Milestone Modal */}
      {editingMilestone && (
        <EditMilestoneModal
          isOpen={Boolean(editingMilestone)}
          onClose={() => setEditingMilestone(null)}
          milestone={editingMilestone}
          eventDate={activeEvent.eventDate}
          eventTime={activeEvent.eventTime}
          eventTitle={activeEvent.title}
          onSave={handleSaveEditedMilestone}
          onDelete={handleDeleteTask}
        />
      )}

      {/* Push to Google Calendar Modal */}
      {isPushModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <GoogleCalendarSync
              events={events}
              selectedEventId={activeEvent.id}
              onUpdateEvent={onUpdateEvent}
              onClose={() => setIsPushModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Delete Event & Google Calendar Cleanup Modal */}
      {isDeleteModalOpen && activeEvent && (
        <DeleteEventModal
          event={activeEvent}
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirmDeleteAppOnly={(id) => {
            onDeleteEvent(id);
            setIsDeleteModalOpen(false);
          }}
          onConfirmDeleteCalendarOnly={(id, summary) => {
            if (onDeleteEventFromCalendarOnly) {
              onDeleteEventFromCalendarOnly(id, summary);
            }
            setIsDeleteModalOpen(false);
          }}
          onConfirmDeleteAppAndCalendar={(id, summary) => {
            if (onDeleteEventAndCalendar) {
              onDeleteEventAndCalendar(id, summary);
            } else {
              onDeleteEvent(id);
            }
            setIsDeleteModalOpen(false);
          }}
        />
      )}


      {/* Refine Deliverable Modal - milestone-level only. The deliverable-
          level "Decide" button/popup (architecture reset Phase 8) was
          removed - it duplicated the unified Open Decisions panel above
          with a worse, often irrelevant options list, per live feedback. */}
      {refiningDeliverable && activeEvent && (
        <RefineDeliverableModal
          isOpen={Boolean(refiningDeliverable)}
          onClose={() => setRefiningDeliverable(null)}
          milestone={refiningDeliverable}
          event={activeEvent}
          onSaveMilestone={(updated) => {
            // A single onUpdateEvent call carrying both the milestone patch
            // and the outstandingGaps patch together, rather than two
            // separate calls each closing over the same pre-update
            // `activeEvent` - two separate calls raced, with the second
            // silently reverting the first's milestone change.
            if (onUpdateEvent) {
              const milestones = activeEvent.milestones.map((m) => (m.id === updated.id ? updated : m));
              const outstandingGaps = activeEvent.outstandingGaps?.some((g) => g.key === updated.id)
                ? activeEvent.outstandingGaps.filter((g) => g.key !== updated.id)
                : activeEvent.outstandingGaps;
              onUpdateEvent({ ...activeEvent, milestones, outstandingGaps });
            } else if (onUpdateMilestone) {
              onUpdateMilestone(activeEvent.id, updated);
            }
            setRefiningDeliverable(null);
          }}
        />
      )}

    </div>
  );
};

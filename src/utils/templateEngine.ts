import * as XLSX from 'xlsx';
import { CustomPreset, CustomPresetMilestone, SpreadsheetColumnMapping, TMinusMilestone, MilestoneCategory } from '../types.js';

const STORAGE_KEY = 'ahead_custom_presets_v1';

/**
 * Built-in default presets for domain-specific workflows
 */
export const DEFAULT_CUSTOM_PRESETS: CustomPreset[] = [
  {
    id: 'preset-app-launch',
    title: 'Mobile App Store Launch Runway',
    description: 'Deterministic 60-day reverse timeline for iOS & Android releases, QA freezes, App Store submissions and launch marketing.',
    category: 'project_deadline',
    tags: ['Engineering', 'Mobile', 'QA', 'Marketing'],
    isBuiltIn: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    milestones: [
      {
        id: 'cpm-1',
        task: 'Architecture & Core UI Feature Cut',
        t_minus_days: 60,
        tag: 'Engineering',
        description: 'Hard freeze on net-new features. Branch cut for release candidate branch.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-2',
        task: 'TestFlight & Internal Beta Build Distribution',
        t_minus_days: 45,
        tag: 'QA',
        description: 'Distribute signed build to internal dogfooders & VIP beta cohort.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-3',
        task: 'App Store Screenshots, Copy & Localization Lock',
        t_minus_days: 30,
        tag: 'Design',
        description: 'Finalize 6.7" and 6.1" store assets, promotional text and privacy nutrition disclosures.',
        kind: 'deliverable',
        scope: 'macro'
      },
      {
        id: 'cpm-4',
        task: 'Security Audit & Third-Party SDK Review',
        t_minus_days: 21,
        tag: 'Security',
        description: 'Verify analytics compliance, ATS configuration, and authentication token lifetimes.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-5',
        task: 'Full QA Regression & Performance Benchmarking',
        t_minus_days: 14,
        tag: 'QA',
        description: 'Execute critical-path smoke tests, cold-launch latency checks and battery profiling.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-6',
        task: 'App Store & Google Play Review Submission',
        t_minus_days: 7,
        tag: 'Release',
        description: 'Submit build for standard App Store review with "Manual Release" toggle selected.',
        kind: 'deliverable',
        scope: 'macro'
      },
      {
        id: 'cpm-7',
        task: 'Production Staging, DB Migration & Rollback Runbook',
        t_minus_days: 2,
        tag: 'DevOps',
        description: 'Dry run staging database migrations, cache warming and customer support triage channels.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-8',
        task: 'Release Flip & Real-Time Crash Telemetry Monitoring',
        t_minus_days: 0,
        tag: 'Operations',
        description: 'Flip release to 100% phased rollout. Monitor Sentry & Datadog crash rates.',
        kind: 'milestone',
        scope: 'macro'
      }
    ]
  },
  {
    id: 'preset-product-release',
    title: 'Major SaaS Product Release Cycle',
    description: 'High-rigor 45-day operational release protocol with legal, security, documentation and customer enablement gates.',
    category: 'project_deadline',
    tags: ['Product', 'SaaS', 'Release', 'GoToMarket'],
    isBuiltIn: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    milestones: [
      {
        id: 'cpm-20',
        task: 'Product Scope Freeze & Acceptance Criteria Lock',
        t_minus_days: 45,
        tag: 'Product',
        description: 'All user stories marked Done or deferred. No scope additions without VP sign-off.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-21',
        task: 'End-to-End Regression & Load Testing Run',
        t_minus_days: 30,
        tag: 'QA',
        description: 'Stress test database replicas and verify API p99 latency under 2x projected peak traffic.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-22',
        task: 'Customer Documentation & Public API Changelog Lock',
        t_minus_days: 21,
        tag: 'Docs',
        description: 'Publish developer SDK reference docs and draft help desk guide updates.',
        kind: 'deliverable',
        scope: 'micro'
      },
      {
        id: 'cpm-23',
        task: 'Sales, Customer Success & Support Enablement Briefing',
        t_minus_days: 14,
        tag: 'GTM',
        description: 'Train frontline support on common FAQs, troubleshooting scripts and escalation pathways.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-24',
        task: 'Release Candidate (RC) Staging Verification',
        t_minus_days: 7,
        tag: 'Release',
        description: 'Deploy RC build to staging environment with live production database snapshot mirror.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-25',
        task: 'Executive Go / No-Go Sign-Off Gate',
        t_minus_days: 2,
        tag: 'Executive',
        description: 'Review blocker-free status across Engineering, Support, Legal and Marketing leads.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-26',
        task: 'Database Schema Migration & Pre-flight Health Check',
        t_minus_days: 1,
        tag: 'Infrastructure',
        description: 'Execute zero-downtime table migration and verify read replica replication lag.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-27',
        task: 'General Availability (GA) Launch & Press Release Go-Live',
        t_minus_days: 0,
        tag: 'Marketing',
        description: 'Switch feature flags to 100%, publish launch blog post and activate promo newsletter.',
        kind: 'milestone',
        scope: 'macro'
      }
    ]
  },
  {
    id: 'preset-marketing-campaign',
    title: 'Integrated Product Marketing Launch Campaign',
    description: '35-day go-to-market runway from positioning lock through embargo, paid media activation and post-launch performance reporting.',
    category: 'project_deadline',
    tags: ['Marketing', 'PMM', 'Campaign', 'Content'],
    isBuiltIn: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    milestones: [
      {
        id: 'cpm-30',
        task: 'Positioning, Messaging & ICP Narrative Lock',
        t_minus_days: 35,
        tag: 'Product Marketing',
        description: 'Finalize value proposition, competitive battlecards and target segment narrative before any campaign asset goes into production.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-31',
        task: 'Campaign Creative Brief & Content Calendar Build',
        t_minus_days: 28,
        tag: 'Content',
        description: 'Brief design, video and copy teams and map blog, social, email and ad creative across the full launch window.',
        kind: 'deliverable',
        scope: 'macro'
      },
      {
        id: 'cpm-32',
        task: 'Analyst & Press Embargo Briefing Outreach',
        t_minus_days: 21,
        tag: 'PR',
        description: 'Send embargoed briefing decks to target press and industry analysts under NDA ahead of the public announcement.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-33',
        task: 'Paid Media Account Setup & Tracking Audit',
        t_minus_days: 14,
        tag: 'Paid Media',
        description: 'Configure ad accounts, UTM taxonomy and conversion pixels; verify attribution end-to-end before spend goes live.',
        kind: 'deliverable',
        scope: 'micro'
      },
      {
        id: 'cpm-34',
        task: 'Sales & Customer Success Enablement Briefing',
        t_minus_days: 10,
        tag: 'Enablement',
        description: 'Train frontline sales and support teams on new messaging, pricing and FAQs ahead of launch-day inbound demand.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-35',
        task: 'Landing Page Copy Freeze & Cross-Browser QA',
        t_minus_days: 7,
        tag: 'Web',
        description: 'Lock landing page copy, forms and tracking; run cross-browser and load QA ahead of the launch-day traffic spike.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-36',
        task: 'Influencer & Co-Marketing Partner Assets Finalized',
        t_minus_days: 3,
        tag: 'Partnerships',
        description: 'Confirm final creative, talking points and posting schedule with influencer and co-marketing partners.',
        kind: 'deliverable',
        scope: 'micro'
      },
      {
        id: 'cpm-37',
        task: 'Embargo Lift, Press Release & Paid Campaigns Go-Live',
        t_minus_days: 0,
        tag: 'Launch Day',
        description: 'Publish the press release, flip paid campaigns live across channels and send the announcement email.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-38',
        task: 'Post-Launch Performance Readout & Budget Reallocation',
        t_minus_days: -7,
        tag: 'Analytics',
        description: 'Review traffic, pipeline and conversion data against launch KPIs; reallocate paid spend toward top-performing channels.',
        kind: 'milestone',
        scope: 'macro'
      }
    ]
  },
  {
    id: 'preset-sales-qbr',
    title: 'Enterprise QBR & Renewal Runway',
    description: '21-day preparation runway for a high-stakes enterprise Quarterly Business Review, from account health analysis through renewal or expansion close.',
    category: 'project_deadline',
    tags: ['Sales', 'CustomerSuccess', 'Renewal', 'RevOps'],
    isBuiltIn: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    milestones: [
      {
        id: 'cpm-40',
        task: 'Account Health & Usage Data Compilation',
        t_minus_days: 21,
        tag: 'RevOps',
        description: 'Pull product usage, support ticket trends and contract terms into a single account health snapshot.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-41',
        task: 'Renewal Risk Scoring & Expansion Opportunity Review',
        t_minus_days: 17,
        tag: 'Customer Success',
        description: 'Score churn risk and flag upsell/cross-sell opportunities with the account team before deck production starts.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-42',
        task: 'QBR Deck & Executive Narrative Draft',
        t_minus_days: 14,
        tag: 'Sales',
        description: 'Build the QBR narrative around measurable business outcomes and ROI delivered since the last review.',
        kind: 'deliverable',
        scope: 'macro'
      },
      {
        id: 'cpm-43',
        task: 'Internal Pre-Brief with Sales & CS Leadership',
        t_minus_days: 10,
        tag: 'Leadership',
        description: 'Align internally on pricing flexibility, expansion targets and negotiation red lines before meeting the customer.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-44',
        task: 'Custom Pricing & Expansion Proposal Finalized',
        t_minus_days: 7,
        tag: 'Deal Desk',
        description: 'Lock proposed pricing tiers and contract terms with deal desk and finance sign-off.',
        kind: 'deliverable',
        scope: 'micro'
      },
      {
        id: 'cpm-45',
        task: 'Customer Stakeholder Calendar Confirmation',
        t_minus_days: 3,
        tag: 'Account Management',
        description: 'Confirm attendance of the economic buyer and key stakeholders; send agenda and pre-read materials.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-46',
        task: 'Quarterly Business Review Meeting & Proposal Presentation',
        t_minus_days: 0,
        tag: 'Sales',
        description: 'Deliver the QBR, present the renewal or expansion proposal and capture live stakeholder feedback.',
        kind: 'milestone',
        scope: 'macro'
      },
      {
        id: 'cpm-47',
        task: 'Follow-Up Action Items & Procurement Handoff',
        t_minus_days: -3,
        tag: 'RevOps',
        description: 'Send recap notes and outstanding questions, and hand off redlines to legal and procurement for contract turnaround.',
        kind: 'milestone',
        scope: 'micro'
      },
      {
        id: 'cpm-48',
        task: 'Signed Renewal / Expansion Contract Close',
        t_minus_days: -14,
        tag: 'Sales',
        description: 'Countersign the renewal or expansion agreement and hand off to customer success for onboarding of the new scope.',
        kind: 'deliverable',
        scope: 'macro'
      }
    ]
  }
];

/**
 * Parses uploaded spreadsheet file (.csv, .xlsx, .xls)
 */
export async function parseSpreadsheetFile(file: File): Promise<{ headers: string[]; rows: any[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('Spreadsheet contains no visible worksheets.');
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON array of row objects
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          throw new Error('No readable data rows found in this sheet.');
        }

        // Extract headers from keys of the first non-empty row
        const headers = Object.keys(rawJson[0]);

        resolve({ headers, rows: rawJson });
      } catch (err: any) {
        reject(new Error(err?.message || 'Failed to parse spreadsheet file'));
      }
    };

    reader.onerror = () => {
      reject(new Error('File reading failed. Please check permissions and file format.'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Reads every sheet of an uploaded workbook as raw row grids (no header-row
 * assumptions). Used by the AI smart-import path, which needs to see the
 * whole file — dashboards, section headers, multiple tabs — not just a
 * single clean table starting at row 1.
 */
export async function parseSpreadsheetForAI(file: File): Promise<{ sheets: { name: string; rows: any[][] }[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('Spreadsheet contains no visible worksheets.');
        }

        const MAX_ROWS_PER_SHEET = 200;
        const sheets = workbook.SheetNames.map((name) => {
          const worksheet = workbook.Sheets[name];
          const allRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          // Drop fully-blank rows and cap length so the payload stays bounded
          const nonEmptyRows = allRows.filter((row) => row.some((cell) => String(cell).trim() !== ''));
          return { name, rows: nonEmptyRows.slice(0, MAX_ROWS_PER_SHEET) };
        });

        resolve({ sheets });
      } catch (err: any) {
        reject(new Error(err?.message || 'Failed to parse spreadsheet file'));
      }
    };

    reader.onerror = () => {
      reject(new Error('File reading failed. Please check permissions and file format.'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Intelligently auto-detects column mappings based on typical spreadsheet header names
 */
export function autoDetectColumnMapping(headers: string[]): SpreadsheetColumnMapping {
  const mapping: SpreadsheetColumnMapping = {
    taskCol: '',
    offsetCol: '',
    tagCol: '',
    descCol: '',
  };

  const normalize = (h: string) => h.trim().toLowerCase().replace(/[_\s-]+/g, '');

  for (const h of headers) {
    const n = normalize(h);

    // 1. Task column
    if (!mapping.taskCol && (n.includes('task') || n.includes('title') || n.includes('milestone') || n.includes('name') || n.includes('item') || n.includes('action'))) {
      mapping.taskCol = h;
    }

    // 2. Offset / Lead Time column
    if (!mapping.offsetCol && (n.includes('offset') || n.includes('tminus') || n.includes('leadtime') || n.includes('days') || n.includes('buffer') || n.includes('timeline') || n.includes('day'))) {
      mapping.offsetCol = h;
    }

    // 3. Tag / Category column
    if (!mapping.tagCol && (n.includes('tag') || n.includes('category') || n.includes('department') || n.includes('dept') || n.includes('team') || n.includes('owner') || n.includes('stage'))) {
      mapping.tagCol = h;
    }

    // 4. Description column
    if (!mapping.descCol && (n.includes('desc') || n.includes('note') || n.includes('detail') || n.includes('instruction') || n.includes('comment'))) {
      mapping.descCol = h;
    }
  }

  // Fallback: if taskCol wasn't found, pick first column
  if (!mapping.taskCol && headers.length > 0) {
    mapping.taskCol = headers[0];
  }

  return mapping;
}

/**
 * Parses flexible lead time offset expressions:
 * "T-30", "T-30d", "T-14", "Day -60", "D-60", "-30", "30", "Day 1", "T+7", "T-Day"
 */
export function parseLeadTimeOffset(rawVal: any): number {
  if (rawVal === undefined || rawVal === null) return 0;
  if (typeof rawVal === 'number') {
    // If entered as positive or negative number
    // E.g., 30 usually means 30 days before event in lead time tables
    return Math.round(rawVal);
  }

  const str = String(rawVal).trim().toLowerCase();
  if (!str) return 0;

  if (str === 't-day' || str === 't-0' || str === 'day 0' || str === 'launch' || str === 'event') {
    return 0;
  }

  // Check for explicit "T+<num>" or "Day +<num>" (post-event milestone)
  const postMatch = str.match(/(?:t\+|day\s*\+|d\+)\s*(\d+)/i);
  if (postMatch) {
    return -parseInt(postMatch[1], 10); // Negative t_minus means after event
  }

  // Check for explicit "T-<num>" or "T <num>" or "Day -<num>" or "D-<num>"
  const preMatch = str.match(/(?:t-|t\s*-?|day\s*-?|d-?)\s*(\d+)/i);
  if (preMatch) {
    return parseInt(preMatch[1], 10);
  }

  // Check for plain number (e.g. "30", "-14", "60 days")
  const numMatch = str.match(/(-?\d+)/);
  if (numMatch) {
    const parsed = parseInt(numMatch[1], 10);
    // If user wrote positive number like "30 days", treat as lead time 30
    // If user wrote "-30", treat absolute value as 30
    return Math.abs(parsed);
  }

  return 0;
}

/**
 * Maps spreadsheet rows into structured CustomPresetMilestones using the chosen mapping
 */
export function mapRowsToMilestones(rows: any[], mapping: SpreadsheetColumnMapping): CustomPresetMilestone[] {
  if (!mapping.taskCol) return [];

  const milestones: CustomPresetMilestone[] = [];

  rows.forEach((row, idx) => {
    const rawTask = row[mapping.taskCol];
    if (!rawTask || String(rawTask).trim() === '') return;

    const task = String(rawTask).trim();
    const rawOffset = mapping.offsetCol ? row[mapping.offsetCol] : undefined;
    const t_minus_days = parseLeadTimeOffset(rawOffset);

    const rawTag = mapping.tagCol ? row[mapping.tagCol] : undefined;
    const tag = rawTag ? String(rawTag).trim() : 'Operations';

    const rawDesc = mapping.descCol ? row[mapping.descCol] : undefined;
    const description = rawDesc ? String(rawDesc).trim() : undefined;

    const isDeliverable = /deliverable|order|reserve|book|submit|lock|deploy|flip|dispatch/i.test(task) || /deliverable/i.test(tag);

    milestones.push({
      id: `cpm-imp-${idx + 1}-${Date.now().toString(36)}`,
      task,
      t_minus_days,
      tag,
      description,
      kind: isDeliverable ? 'deliverable' : 'milestone',
      scope: Math.abs(t_minus_days) >= 14 ? 'macro' : 'micro',
    });
  });

  // Sort descending by t_minus_days so earliest preparation comes first
  milestones.sort((a, b) => b.t_minus_days - a.t_minus_days);

  return milestones;
}

/**
 * DETERMINISTIC MILESTONE PROJECTION (Zero-LLM Cost, 100% Instant)
 * Uses exact date arithmetic:
 * milestone_target_date = target_event_date - t_minus_days
 */
export function projectPresetToMilestones(
  preset: CustomPreset,
  targetEventDate: string, // YYYY-MM-DD
  targetEventTime: string = '10:00',
  eventId: string,
  overrideMilestones?: CustomPresetMilestone[]
): TMinusMilestone[] {
  const [year, month, day] = targetEventDate.split('-').map(Number);
  const sourceMilestones = overrideMilestones && overrideMilestones.length > 0 
    ? overrideMilestones 
    : preset.milestones;
  
  return sourceMilestones.map((pm, index) => {
    // Exact calendar date subtraction (avoid UTC daylight savings drift by using date parts)
    const baseDate = new Date(year, month - 1, day, 12, 0, 0);
    baseDate.setDate(baseDate.getDate() - pm.t_minus_days);

    const calcYear = baseDate.getFullYear();
    const calcMonth = String(baseDate.getMonth() + 1).padStart(2, '0');
    const calcDay = String(baseDate.getDate()).padStart(2, '0');
    const calculatedDate = `${calcYear}-${calcMonth}-${calcDay}`;

    // Calculate T-Minus label
    let tMinusLabel = 'T-Day';
    if (pm.t_minus_days > 0) {
      tMinusLabel = `T-${pm.t_minus_days}d`;
    } else if (pm.t_minus_days < 0) {
      tMinusLabel = `Day +${Math.abs(pm.t_minus_days)}`;
    }

    const tMinusOffsetMinutes = -pm.t_minus_days * 24 * 60;

    return {
      id: `m-proj-${eventId}-${index + 1}-${Date.now().toString(36)}`,
      eventId,
      tMinusLabel,
      tMinusOffsetMinutes,
      calculatedDate,
      title: pm.task,
      description: pm.description || `Milestone projected from "${preset.title}" (${pm.tag || 'Workflow'})`,
      category: (preset.category as any) || 'project_deadline',
      status: 'pending',
      scope: pm.scope || (Math.abs(pm.t_minus_days) >= 14 ? 'macro' : 'micro'),
      tag: pm.tag || 'Operations',
      kind: pm.kind || 'milestone',
      deliverableType: pm.deliverableType || (pm.kind === 'deliverable' ? 'booking' : 'general'),
    };
  });
}

/**
 * Storage helpers for Custom Presets (LocalStorage persistence)
 */
export function loadCustomPresets(): CustomPreset[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: CustomPreset[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge with built-in presets if any were updated
        const builtInIds = new Set(DEFAULT_CUSTOM_PRESETS.map((p) => p.id));
        const userPresets = parsed.filter((p) => !builtInIds.has(p.id));
        return [...DEFAULT_CUSTOM_PRESETS, ...userPresets];
      }
    }
  } catch (err) {
    console.warn('Failed to load custom presets from localStorage:', err);
  }
  return DEFAULT_CUSTOM_PRESETS;
}

export function saveCustomPreset(preset: CustomPreset): CustomPreset[] {
  try {
    const current = loadCustomPresets();
    const existingIndex = current.findIndex((p) => p.id === preset.id);

    let updated: CustomPreset[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...preset, updatedAt: new Date().toISOString() };
    } else {
      updated = [
        ...current,
        {
          ...preset,
          createdAt: preset.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save custom preset:', err);
    return loadCustomPresets();
  }
}

export function saveCustomPresets(presets: CustomPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (err) {
    console.error('Failed to save custom presets array:', err);
  }
}

export function deleteCustomPreset(presetId: string): CustomPreset[] {
  try {
    const current = loadCustomPresets();
    const updated = current.filter((p) => p.id !== presetId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to delete custom preset:', err);
    return loadCustomPresets();
  }
}

/**
 * Sample CSV generator so user can download a pre-formatted template with 1 click
 */
export function generateSampleCSV(presetType: 'app_launch' | 'onboarding' | 'generic' = 'app_launch'): string {
  if (presetType === 'app_launch') {
    return `Task,Offset,Tag,Description
Architecture & Core UI Feature Cut,T-60d,Engineering,Hard freeze on net-new features. Branch cut for release.
TestFlight & Internal Beta Build Distribution,T-45d,QA,Distribute signed build to internal dogfooders & VIP cohort.
App Store Screenshots Copy & Localization Lock,T-30d,Design,Finalize 6.7" and 6.1" store assets and disclosures.
Security Audit & Third-Party SDK Review,T-21d,Security,Verify analytics compliance and authentication token lifetimes.
Full QA Regression & Performance Benchmarking,T-14d,QA,Execute critical-path smoke tests and battery profiling.
App Store & Google Play Review Submission,T-7d,Release,Submit build for review with Manual Release toggle.
Production Staging DB Migration & Rollback Runbook,T-2d,DevOps,Dry run staging database migrations and cache warming.
Release Flip & Real-Time Crash Telemetry Monitoring,T-Day,Operations,Flip release to 100% phased rollout. Monitor Sentry & Datadog.`;
  }

  if (presetType === 'onboarding') {
    return `Task,Offset,Tag,Description
Hardware Laptop & Security Key Dispatch,T-14d,IT,Order machine specs and dispatch to residence.
Account Provisioning & Calendar Welcome Invite,T-7d,IT,Provision Google Workspace Slack and GitHub.
Desk Prep & Welcome Swag Kit Assembly,T-2d,Office,Prepare physical badge and welcome package.
Day 1 Orientation & Peer Buddy Intro,T-Day,HR,Welcome coffee company briefing and team lunch.
Week 1 Retrospective & Setup Check-in,Day +7,Manager,30-minute sync to remove initial blockers.
30-Day Milestone Review & Role Expectations,Day +30,Manager,Formal check-in on role autonomy and initial goals.
60-Day Progress Check & Feedback Calibration,Day +60,Manager,Two-way review on velocity and peer feedback.
90-Day Full Performance Review & Probation Sign-off,Day +90,HR,Completion of onboarding runway and role sign-off.`;
  }

  return `Task,Offset,Tag,Description
Kickoff & Project Scope Alignment,T-30d,Planning,Align stakeholders and lock deliverables.
Mid-point Progress Check & Blocker Removal,T-14d,Operations,Assess pacing and dependencies.
Final Review & Quality Assurance,T-7d,QA,Review all outputs against acceptance criteria.
Executive Sign-off & Client Presentation Prep,T-2d,Leadership,Dry run presentations and lock briefing notes.
Project Milestone Completion & Retrospective,T-Day,Management,Deliver milestone and conduct team retro.`;
}

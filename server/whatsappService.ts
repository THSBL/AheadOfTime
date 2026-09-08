import { 
  MetaTemplateMessagePayload, 
  MetaInteractiveButtonsPayload, 
  MetaTextMessagePayload,
  WhatsAppEventSessionState 
} from '../src/types/whatsapp.js';
import { TMinusMilestone } from '../src/types.js';

export class WhatsAppService {
  /**
   * Constructs the official Meta WhatsApp Cloud API Request Payload
   * for the outbound proactive utility template.
   *
   * Template Name: ahead_of_time_event_alert
   * Category: UTILITY
   * Body parameters:
   *   {{1}} = User's first name (e.g., "Alex")
   *   {{2}} = Event Title (e.g., "Weekend away with friends")
   *   {{3}} = Event Date formatted (e.g., "Oct 18, 2026")
   * Buttons (Quick Reply):
   *   Button 0: "Add Details" (payload: "BTN_ADD_DETAILS:<eventId>")
   *   Button 1: "Track As-Is" (payload: "BTN_TRACK_AS_IS:<eventId>")
   *   Button 2: "Ignore" (payload: "BTN_IGNORE:<eventId>")
   */
  public static buildProactiveTemplatePayload(
    toPhoneNumber: string,
    userFirstName: string,
    eventTitle: string,
    formattedEventDate: string,
    eventId: string
  ): MetaTemplateMessagePayload {
    // E.164 sanitization (remove spaces, plus, hyphens for Cloud API "to" field)
    const cleanPhone = toPhoneNumber.replace(/[^0-9]/g, '');

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'template',
      template: {
        name: 'ahead_of_time_event_alert',
        language: {
          code: 'en_US',
        },
        components: [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                text: userFirstName.trim() || 'there',
              },
              {
                type: 'text',
                text: eventTitle.trim(),
              },
              {
                type: 'text',
                text: formattedEventDate.trim(),
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 0,
            parameters: [
              {
                type: 'payload',
                payload: `BTN_ADD_DETAILS:${eventId}`,
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 1,
            parameters: [
              {
                type: 'payload',
                payload: `BTN_TRACK_AS_IS:${eventId}`,
              },
            ],
          },
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: 2,
            parameters: [
              {
                type: 'payload',
                payload: `BTN_IGNORE:${eventId}`,
              },
            ],
          },
        ],
      },
    };
  }

  /**
   * Constructs an Interactive Button Reply message payload (within 24-hour open session)
   */
  public static buildInteractiveButtonsPayload(
    toPhoneNumber: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>
  ): MetaInteractiveButtonsPayload {
    const cleanPhone = toPhoneNumber.replace(/[^0-9]/g, '');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: bodyText,
        },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: {
              id: b.id,
              title: b.title.slice(0, 20), // Meta strict max 20 chars per button label
            },
          })),
        },
      },
    };
  }

  /**
   * Constructs a plain text message payload
   */
  public static buildTextMessagePayload(
    toPhoneNumber: string,
    bodyText: string
  ): MetaTextMessagePayload {
    const cleanPhone = toPhoneNumber.replace(/[^0-9]/g, '');
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: bodyText,
      },
    };
  }

  /**
   * Dispatches payload to Meta Graph API
   * POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
   */
  public static async sendMetaApiMessage(
    payload: MetaTemplateMessagePayload | MetaInteractiveButtonsPayload | MetaTextMessagePayload
  ): Promise<{ success: boolean; messageId?: string; mode: 'live_meta_api' | 'simulated'; error?: string; rawResponse?: any }> {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    // If live credentials are not supplied, return successful simulated payload execution
    if (!phoneNumberId || !accessToken) {
      const mockMsgId = `wamid.HBgL${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      return {
        success: true,
        messageId: mockMsgId,
        mode: 'simulated',
        rawResponse: {
          messaging_product: 'whatsapp',
          contacts: [{ input: payload.to, wa_id: payload.to }],
          messages: [{ id: mockMsgId }],
          note: 'Sent via AheadOfTime WhatsApp sandbox simulator (Configure WHATSAPP_ACCESS_TOKEN for live Meta Graph delivery)',
        },
      };
    }

    const endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('Meta WhatsApp Cloud API error:', responseData);
        return {
          success: false,
          mode: 'live_meta_api',
          error: responseData?.error?.message || `Meta API HTTP ${response.status}`,
          rawResponse: responseData,
        };
      }

      const messageId = responseData?.messages?.[0]?.id;
      return {
        success: true,
        messageId,
        mode: 'live_meta_api',
        rawResponse: responseData,
      };
    } catch (err: any) {
      console.error('WhatsApp API network error:', err);
      return {
        success: false,
        mode: 'live_meta_api',
        error: err.message || 'Network error communicating with Meta API',
      };
    }
  }

  /**
   * Helper to format milestone review confirmation message
   */
  public static formatMilestoneReviewSummary(
    session: WhatsAppEventSessionState,
    milestones: TMinusMilestone[]
  ): string {
    const lines = [
      `🎯 *AheadOfTime Preparation Runway* for *${session.eventTitle}*:`,
      '',
    ];

    milestones.slice(0, 6).forEach((m, idx) => {
      const icon = m.tag?.toLowerCase().includes('booking') ? '🎟️' :
                   m.tag?.toLowerCase().includes('dining') || m.tag?.toLowerCase().includes('dinner') ? '🍽️' :
                   m.tag?.toLowerCase().includes('transport') ? '🚗' :
                   m.tag?.toLowerCase().includes('gift') ? '🎁' :
                   m.tag?.toLowerCase().includes('packing') ? '🧳' : '📌';
      lines.push(`${icon} *${m.tMinusLabel}* (${m.calculatedDate}): ${m.title}`);
    });

    lines.push('');
    lines.push(`I mapped out *${milestones.length} prep milestones*. Should I push these directly to your calendar?`);

    return lines.join('\n');
  }
}

import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import { apiPreviewSms } from "./restClient";
import type { SmsInboxMessage, SmsPreview } from "./restClient";

type SmsReaderNative = { readRecent(limit: number): Promise<SmsInboxMessage[]> };
const SmsReader = NativeModules.SmsReader as SmsReaderNative | undefined;

export async function previewRecentSms(): Promise<SmsPreview> {
  if (Platform.OS !== "android") throw new Error("SMS import is available on Android only.");
  if (!SmsReader) throw new Error("The Android SMS module is missing. Rebuild the app with `npx expo run:android`.");
  const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: "Import payment messages",
    message: "Finance Copilot reads up to 100 recent SMS messages. Regex filters likely completed transactions before parsing. Message text is sent through your signed-in backend and is not saved in the ledger.",
    buttonPositive: "Allow",
    buttonNegative: "Cancel",
  });
  if (permission !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("SMS read permission was not granted.");

  const messages = (await SmsReader.readRecent(100)).map((message) => ({
    ...message,
    timezone_offset_minutes: -new Date(message.timestamp).getTimezoneOffset(),
  }));
  return apiPreviewSms(messages);
}

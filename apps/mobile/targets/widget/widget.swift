import SwiftUI
import UIKit
import WidgetKit

// Namespaced as static members of an enum (never instantiated) rather than
// top-level `let`/`func` declarations — a file with @main can't coexist
// with genuine top-level *executable* code in the same module, and
// isoFormatter's immediately-invoked closure below counts as exactly that
// at file scope. Wrapping everything in a type sidesteps the question
// entirely.
private enum Shared {
    // Must match app.json's ios.entitlements app-group *and*
    // src/widgets/iosWidgetSync.ts's WIDGET_APP_GROUP exactly — this is the
    // only channel data crosses between the main app (a separate process)
    // and this extension.
    static let appGroup = "group.com.anonymous.puraevents.widget"
    static let eventsKey = "events"
    // Same "Today" banner photo the Events tab's own hero card shows —
    // written by src/widgets/iosWidgetSync.ts only when there's no
    // upcoming event at all, read here for the empty-state background
    // (see content()'s own isEmpty branch).
    static let heroPhotoKey = "heroPhoto"

    static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    // Mirrors src/widgets/widgetEventSummary.ts's WidgetEventSummary shape,
    // plus the one extra field iosWidgetSync.ts adds on top of it —
    // photoDataUri isn't part of that shared TS shape at all (it's
    // iOS-only, computed just before writing across the App Group; see
    // that file's own comment for why), the JSON array the main app writes
    // via ExtensionStorage, one entry per still-upcoming event (soonest
    // first). `repeat` needs its own CodingKeys entry since it's a Swift
    // keyword and can't be a bare property name.
    struct EventSummary: Decodable {
        let id: String
        let title: String
        let nextOccurrenceISO: String
        let accentHex: String
        let category: String
        let repeatRule: String
        let note: String?
        let photoDataUri: String?

        enum CodingKeys: String, CodingKey {
            case id, title, nextOccurrenceISO, accentHex, category, note, photoDataUri
            case repeatRule = "repeat"
        }
    }

    // Category icon artwork — the same 6 PNGs as
    // src/theme/icons.ts' CATEGORY_ICONS (colored circle + white line-icon),
    // copied into this target's own Assets.xcassets under matching
    // "category-<key>" names, since this extension can't reach into the
    // main app's JS require()'d assets at all. Falls back to "other" for
    // anything unrecognized, mirroring getCategoryIcon's own fallback.
    static func categoryImageName(_ category: String) -> String {
        let known: Set<String> = ["personal", "work", "travel", "finance", "health", "other"]
        return "category-\(known.contains(category) ? category : "other")"
    }

    // Hardcoded English, not localized — this headless widget extension
    // has no access to react-i18next, same reason androidWidgetTask.tsx's
    // own CATEGORY_LABELS/REPEAT_LABELS are plain literals there too (kept
    // identical wording here for parity between the two platforms).
    static let categoryLabels: [String: String] = [
        "personal": "Personal", "work": "Work", "travel": "Travel",
        "finance": "Finance", "health": "Health", "other": "Other",
    ]
    static let repeatLabels: [String: String] = [
        "none": "No repeat", "yearly": "Yearly", "monthly": "Monthly", "weekly": "Weekly",
    ]

    static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEE, MMM d · HH:mm"
        return formatter
    }()

    // Separate from dateFormatter above (which is scoped to an *event's*
    // own date) — the empty-state "Today" banner's own line always
    // includes the year, matching EventHeroCard.tsx's own formatTodayLine
    // (see content()'s own isEmpty branch below).
    static let todayDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEE, MMM d, yyyy · HH:mm"
        return formatter
    }()

    // photoDataUri is a "data:image/jpeg;base64,…" string (see
    // widgetPhoto.ts's preparePhotoDataUri, shared with Android) — strip
    // the prefix up to the first comma and decode the rest. Returns nil on
    // any malformed/missing input, same "just fall back to the flat
    // accentHex look" contract every other photo failure path in this app
    // already follows (MiniWidget's onError, widgetPhoto.ts's own catch).
    static func decodeDataURIImage(_ dataURI: String?) -> UIImage? {
        guard let dataURI, let commaIndex = dataURI.firstIndex(of: ",") else { return nil }
        guard let data = Data(base64Encoded: String(dataURI[dataURI.index(after: commaIndex)...])) else { return nil }
        return UIImage(data: data)
    }

    static func loadEvents() -> [EventSummary] {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let json = defaults.string(forKey: eventsKey),
            let data = json.data(using: .utf8),
            let events = try? JSONDecoder().decode([EventSummary].self, from: data)
        else { return [] }
        return events
    }

    static func loadHeroPhotoDataUri() -> String? {
        UserDefaults(suiteName: appGroup)?.string(forKey: heroPhotoKey)
    }

    static func parseISODate(_ iso: String) -> Date? {
        isoFormatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    static func hexColor(_ hex: String) -> Color {
        var sanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        sanitized.removeAll { $0 == "#" }
        var rgb: UInt64 = 0
        Scanner(string: sanitized).scanHexInt64(&rgb)
        return Color(
            red: Double((rgb & 0xFF0000) >> 16) / 255,
            green: Double((rgb & 0x00FF00) >> 8) / 255,
            blue: Double(rgb & 0x0000FF) / 255
        )
    }
}

struct NextEventEntry: TimelineEntry {
    let date: Date
    let title: String?
    let accentHex: String
    let targetDate: Date?
    let photoDataUri: String?
    let category: String?
    let repeatRule: String?
    let note: String?
    // Only ever set alongside title == nil (see resolveCurrentEntry below)
    // — the empty-state "Today" hero photo, not this event's own photo.
    // Every has-an-event NextEventEntry(...) call below passes nil.
    let heroPhotoDataUri: String?
}

// No AppIntents-based "Edit Widget" configuration any more — every instance
// always shows whichever event is soonest upcoming, app-wide, matching the
// same "no per-instance choice" decision on Android's androidWidgetTask.tsx
// (resolveSummaryForWidget). An earlier version let each instance be pinned
// to a specific event via an "Event" picker in Edit Widget; deliberately
// simplified back to one auto-updating widget. Plain TimelineProvider, not
// AppIntentTimelineProvider — there's no configuration left to thread
// through, and Shared.loadEvents() is a synchronous UserDefaults read
// anyway, so none of these need to be async.
struct Provider: TimelineProvider {
    // Shown in the widget gallery/preview before the extension has ever
    // actually run once with real data.
    func placeholder(in context: Context) -> NextEventEntry {
        NextEventEntry(
            date: Date(), title: "New York Trip", accentHex: "#A39BE8",
            targetDate: Date().addingTimeInterval(60 * 60 * 24 * 5), photoDataUri: nil,
            category: "travel", repeatRule: "none", note: "Don't forget your passport", heroPhotoDataUri: nil
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (NextEventEntry) -> Void) {
        completion(resolveCurrentEntry())
    }

    // One entry per day from now through the event's own date (capped at
    // 35 days out — the countdown display never needs finer granularity
    // than a whole day, and there's no reason to generate more entries
    // than a user could plausibly scroll back to see), each carrying the
    // same fixed targetDate — the view itself computes "days left" from
    // entry.date vs targetDate at render time, matching how
    // Text(timerInterval:) style countdowns are meant to stay accurate
    // without the extension needing to wake up again in between.
    func getTimeline(in context: Context, completion: @escaping (Timeline<NextEventEntry>) -> Void) {
        let calendar = Calendar.current
        let now = Date()
        let resolved = Shared.loadEvents().first

        guard let resolved, let targetDate = Shared.parseISODate(resolved.nextOccurrenceISO) else {
            completion(Timeline(
                entries: [NextEventEntry(
                    date: now, title: nil, accentHex: "#6558D9", targetDate: nil, photoDataUri: nil,
                    category: nil, repeatRule: nil, note: nil, heroPhotoDataUri: Shared.loadHeroPhotoDataUri()
                )],
                policy: .after(calendar.date(byAdding: .hour, value: 1, to: now) ?? now)
            ))
            return
        }

        let daysUntilTarget = calendar.dateComponents([.day], from: now, to: targetDate).day ?? 0
        let entryCount = max(1, min(daysUntilTarget + 1, 35))

        var entries: [NextEventEntry] = []
        for dayOffset in 0..<entryCount {
            guard let entryDate = calendar.date(byAdding: .day, value: dayOffset, to: calendar.startOfDay(for: now)) else { continue }
            entries.append(NextEventEntry(
                date: entryDate, title: resolved.title, accentHex: resolved.accentHex, targetDate: targetDate,
                photoDataUri: resolved.photoDataUri, category: resolved.category, repeatRule: resolved.repeatRule,
                note: resolved.note, heroPhotoDataUri: nil
            ))
        }

        // Re-derive from the shared data again once these entries run out —
        // either the event happened (needs a fresh "next" one) or the app
        // already asked for an earlier reload via
        // ExtensionStorage.reloadWidget(), whichever comes first.
        let nextReload = entries.last?.date ?? now
        completion(Timeline(entries: entries, policy: .after(calendar.date(byAdding: .day, value: 1, to: nextReload) ?? nextReload)))
    }

    private func resolveCurrentEntry() -> NextEventEntry {
        guard let resolved = Shared.loadEvents().first, let targetDate = Shared.parseISODate(resolved.nextOccurrenceISO) else {
            return NextEventEntry(
                date: Date(), title: nil, accentHex: "#6558D9", targetDate: nil, photoDataUri: nil,
                category: nil, repeatRule: nil, note: nil, heroPhotoDataUri: Shared.loadHeroPhotoDataUri()
            )
        }
        return NextEventEntry(
            date: Date(), title: resolved.title, accentHex: resolved.accentHex, targetDate: targetDate,
            photoDataUri: resolved.photoDataUri, category: resolved.category, repeatRule: resolved.repeatRule,
            note: resolved.note, heroPhotoDataUri: nil
        )
    }
}

// Per-family type scale — systemSmall (~155×155pt) is roughly half
// systemMedium's width (~329×155pt) at the *same* height, so both show the
// *same* full field set (content parity with Android's CountdownCard —
// androidWidgetTask.tsx) but small needs a noticeably smaller scale to fit
// that width without truncating everything. An earlier version dropped
// fields on small instead (an overflow bug made the full set look broken
// there); the actual bug was the photo Image sizing itself off its own
// intrinsic dimensions rather than the given frame (see content(size:)'s
// own comment) — fixed at the source, so small can carry the same content
// as medium now, just smaller.
private struct WidgetTypeScale {
    let icon: CGFloat
    let category: CGFloat
    let repeatLabel: CGFloat
    let title: CGFloat
    let date: CGFloat
    let countdownNumber: CGFloat
    let countdownLabel: CGFloat
    let note: CGFloat

    static let small = WidgetTypeScale(icon: 12, category: 8, repeatLabel: 7, title: 11, date: 8, countdownNumber: 14, countdownLabel: 6, note: 10)
    static let medium = WidgetTypeScale(icon: 14, category: 9, repeatLabel: 8, title: 12, date: 9, countdownNumber: 17, countdownLabel: 7, note: 12)
}

struct PuraEventsWidgetEntryView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) private var family

    // GeometryReader reads WidgetKit's *actual* delivered pixel bounds for
    // this instance directly — confirmed the real bug on-device (screen
    // sharing with the user, see this file's git history): the photo
    // Image's own .aspectRatio(contentMode: .fill), with no frame of its
    // own to fill *into*, let it (and the ZStack around it) size itself
    // to the photo's own intrinsic dimensions instead of the actual
    // widget canvas — oversized on the small family specifically, since
    // small's canvas is much narrower than the photo while medium's is
    // close enough that the mismatch wasn't visible. Handing the Image an
    // explicit `size`-based frame below, before .aspectRatio ever runs,
    // is the actual fix; the outer .frame+.clipped here is a second,
    // belt-and-braces guarantee that nothing in this view can ever render
    // outside its real bounds regardless of cause.
    var body: some View {
        GeometryReader { geo in
            content(size: geo.size)
                .frame(width: geo.size.width, height: geo.size.height)
                .clipped()
        }
    }

    private func content(size: CGSize) -> some View {
        // hasPhoto mirrors Android's CountdownCard (androidWidgetTask.tsx):
        // a photo fills the whole card, with a per-text shadow for
        // legibility instead of a separate dark scrim layer, rather than
        // the flat accentHex fill every other theme gets.
        let photoImage = Shared.decodeDataURIImage(entry.photoDataUri)
        let hasPhoto = photoImage != nil
        // No event at all, not just "this event has no photo" — same
        // on-brand violet skyline hero-fallback image the in-app Today
        // banner (EventHeroCard.tsx) falls back to, bundled into this
        // target's own Assets.xcassets (a widget extension can't reach
        // into the main app bundle's assets), so the empty widget reads
        // as the app's own "hero" look instead of a flat accent box.
        let isEmpty = entry.title == nil || entry.targetDate == nil
        let scale = family == .systemSmall ? WidgetTypeScale.small : WidgetTypeScale.medium
        return ZStack {
            if let photoImage {
                Image(uiImage: photoImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size.width, height: size.height)
                    .clipped()
            } else if isEmpty, let heroImage = Shared.decodeDataURIImage(entry.heroPhotoDataUri) {
                // Same "Today" banner photo the Events tab shows (see
                // storage/heroPhoto.ts) — cached locally by the app and
                // handed across the App Group, same as an event's own
                // custom photo above, rather than this extension fetching
                // Pexels itself on every background refresh.
                Image(uiImage: heroImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size.width, height: size.height)
                    .clipped()
            } else if isEmpty {
                Image("hero-fallback")
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: size.width, height: size.height)
                    .clipped()
            } else {
                Shared.hexColor(entry.accentHex)
            }
            if let title = entry.title, let targetDate = entry.targetDate {
                // Raw diff, not a calendar startOfDay-to-startOfDay
                // difference — matches androidWidgetTask.tsx's own
                // countdownParts exactly (floor of total elapsed ms into
                // D/H/M), so "2 days left" means a full 48h+ away on both
                // platforms, not just "the day after tomorrow" regardless
                // of time-of-day.
                let diffSeconds = max(0, targetDate.timeIntervalSince(Date()))
                let days = Int(diffSeconds / 86400)
                let hours = Int(diffSeconds.truncatingRemainder(dividingBy: 86400) / 3600)
                let minutes = Int(diffSeconds.truncatingRemainder(dividingBy: 3600) / 60)
                let shadow = hasPhoto ? Color.black.opacity(0.7) : Color.black.opacity(0)
                // Event day itself is where docs/PROJECT.md §5.1's
                // "second-by-second must use Text(timerInterval:)"
                // requirement actually matters — that's the API the
                // system uses to keep a widget's text ticking live on its
                // own, with no extension wake-up needed at all. Any day
                // further out only ever changes once every 24h anyway
                // (the daily timeline in Provider already regenerates for
                // that), so a live ticker there would just be visual noise
                // on a number that isn't moving.
                VStack(alignment: .leading, spacing: 4) {
                    // Header row: category icon+label (leading) and repeat
                    // label (trailing) — same two-sided grammar as
                    // Android's CountdownCard header row, same on both
                    // families now (see WidgetTypeScale's own comment).
                    HStack {
                        HStack(spacing: 6) {
                            Image(Shared.categoryImageName(entry.category ?? "other"))
                                .resizable()
                                .frame(width: scale.icon, height: scale.icon)
                            Text(Shared.categoryLabels[entry.category ?? "", default: "Other"])
                                .font(.system(size: scale.category, weight: .heavy))
                                .foregroundColor(.white)
                                .lineLimit(1)
                                .shadow(color: shadow, radius: 3, x: 0, y: 1)
                        }
                        Spacer()
                        Text(Shared.repeatLabels[entry.repeatRule ?? "", default: "No repeat"])
                            .font(.system(size: scale.repeatLabel, weight: .bold))
                            .foregroundColor(.white.opacity(0.85))
                            .lineLimit(1)
                            .shadow(color: shadow, radius: 3, x: 0, y: 1)
                    }
                    Text(title)
                        .font(.system(size: scale.title, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .shadow(color: shadow, radius: 3, x: 0, y: 1)
                    Text(Shared.dateFormatter.string(from: targetDate))
                        .font(.system(size: scale.date, weight: .bold))
                        .foregroundColor(.white.opacity(0.8))
                        .lineLimit(1)
                        .shadow(color: shadow, radius: 3, x: 0, y: 1)
                    Spacer()
                    if days == 0, targetDate > Date() {
                        Text(timerInterval: Date()...targetDate, countsDown: true)
                            .font(.system(size: scale.countdownNumber + 5, weight: .heavy))
                            .foregroundColor(.white)
                            .monospacedDigit()
                            .minimumScaleFactor(0.6)
                            .lineLimit(1)
                            .shadow(color: shadow, radius: 3, x: 0, y: 1)
                        Text("LEFT TODAY")
                            .font(.system(size: scale.countdownLabel + 2, weight: .bold))
                            .foregroundColor(.white.opacity(0.85))
                            .shadow(color: shadow, radius: 3, x: 0, y: 1)
                    } else {
                        // Same D/H/M triple-stat-block layout as Android's
                        // CountdownCard (androidWidgetTask.tsx) — content
                        // parity between the two platforms' widgets, each
                        // stat's number centered over its own D/H/M label
                        // (.center, not .leading) to match.
                        HStack(spacing: family == .systemSmall ? 8 : 10) {
                            ForEach([(days, "D"), (hours, "H"), (minutes, "M")], id: \.1) { value, label in
                                VStack(alignment: .center, spacing: 0) {
                                    Text("\(value)")
                                        .font(.system(size: scale.countdownNumber, weight: .heavy))
                                        .foregroundColor(.white)
                                        .shadow(color: shadow, radius: 3, x: 0, y: 1)
                                    Text(label)
                                        .font(.system(size: scale.countdownLabel, weight: .bold))
                                        .foregroundColor(.white.opacity(0.85))
                                        .shadow(color: shadow, radius: 3, x: 0, y: 1)
                                }
                            }
                        }
                    }
                    if let note = entry.note, !note.isEmpty {
                        Text(note)
                            .font(.system(size: scale.note, weight: .semibold))
                            .foregroundColor(.white.opacity(0.8))
                            .lineLimit(1)
                            .shadow(color: shadow, radius: 3, x: 0, y: 1)
                            .padding(.top, 2)
                    }
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                // Content mirrors EventHeroCard.tsx's own no-event branch
                // exactly (its own comment: "still show the Today banner
                // ... just without a title/countdown") — "TODAY TRIPS"
                // caption top-left, "Today" + the real current date/time
                // bottom-left (a Spacer between them does the same job as
                // that component's own card:{justifyContent:'space-
                // between'}), name+logo small underneath, same as
                // ShareCard.tsx's own subtle brand mark
                // (src/components/ShareCard.tsx) — the hero photo itself
                // is the point here, not a big logo taking over the card.
                let shadow = Color.black.opacity(0.7)
                VStack(alignment: .leading, spacing: 0) {
                    Text("TODAY TRIPS")
                        .font(.system(size: 10, weight: .heavy))
                        .foregroundColor(.white.opacity(0.85))
                        .shadow(color: shadow, radius: 3, x: 0, y: 1)
                    Spacer()
                    Text("Today")
                        .font(.system(size: 18, weight: .heavy))
                        .foregroundColor(.white)
                        .shadow(color: shadow, radius: 3, x: 0, y: 1)
                    Text(Shared.todayDateFormatter.string(from: Date()))
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.white.opacity(0.85))
                        .shadow(color: shadow, radius: 3, x: 0, y: 1)
                    HStack(spacing: 5) {
                        Image("app-icon")
                            .resizable()
                            .frame(width: 16, height: 16)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                        Text("PuraEvents")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                            .shadow(color: shadow, radius: 3, x: 0, y: 1)
                    }
                    .padding(.top, 8)
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
    }
}

struct PuraEventsWidget: Widget {
    let kind: String = "PuraEventsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            PuraEventsWidgetEntryView(entry: entry)
                // iOS 26's Liquid Glass tints/frames every widget using
                // *this* color as its base material — .clear defaulted to
                // a plain white/system tint (the border the user was
                // asking about isn't something our own view can paint at
                // all; it's system-composited around whatever we hand
                // containerBackground). Handing it the event's own accent
                // color instead means that glass frame now tints toward
                // the event's own hue instead of white — closer to the
                // photo's own palette than a neutral system default,
                // though still not literally "the photo bleeding into the
                // border" (no API exposes that region to app content).
                .containerBackground(Shared.hexColor(entry.accentHex), for: .widget)
        }
        .configurationDisplayName("PuraEvents Countdown")
        .description("See how many days are left until your next event.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct PuraEventsWidgetBundle: WidgetBundle {
    var body: some Widget {
        PuraEventsWidget()
    }
}

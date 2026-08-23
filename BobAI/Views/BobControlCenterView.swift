import SwiftUI

struct BobControlCenterView: View {
    @ObservedObject var configuration: BobCoreConfiguration
    @Environment(\.dismiss) private var dismiss

    @State private var coreStatus: BobCoreClient.CoreStatus?
    @State private var activity: [BobCoreClient.ActivityItem] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [
                        Color(red: 0.01, green: 0.02, blue: 0.045),
                        Color(red: 0.025, green: 0.055, blue: 0.105),
                        Color(red: 0.015, green: 0.025, blue: 0.055)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        overview

                        if let errorMessage {
                            errorBanner(errorMessage)
                        }

                        activitySection
                    }
                    .padding(20)
                }
                .refreshable {
                    await refresh()
                }
            }
            .preferredColorScheme(.dark)
            .navigationTitle("Bob Control Center")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await refresh() }
                    } label: {
                        if isLoading {
                            ProgressView()
                                .tint(.cyan)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(isLoading)
                    .accessibilityLabel("Refresh Bob activity")
                }
            }
            .task {
                await refresh()
            }
        }
    }

    private var overview: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(Color.cyan.opacity(0.14))
                        .frame(width: 44, height: 44)
                    Image(systemName: "waveform.path.ecg")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundStyle(.cyan)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Operational overview")
                        .font(.headline)
                    Text("What Bob did — not private reasoning")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10)
                ],
                spacing: 10
            ) {
                statusCard(
                    title: "Core",
                    value: coreStatus?.status.capitalized ?? (configuration.isConfigured ? "Checking" : "Offline"),
                    icon: "cpu",
                    isHealthy: coreStatus?.status == "ready"
                )
                statusCard(
                    title: "Memory",
                    value: coreStatus?.memory?.enabled == true ? "Online" : "Unavailable",
                    icon: "brain.head.profile",
                    isHealthy: coreStatus?.memory?.enabled == true
                )
                statusCard(
                    title: "Shared Context",
                    value: coreStatus?.sharedContext?.enabled == true ? "v\(coreStatus?.sharedContext?.version ?? "0.2")" : "Unavailable",
                    icon: "square.stack.3d.up",
                    isHealthy: coreStatus?.sharedContext?.enabled == true
                )
                statusCard(
                    title: "Activity",
                    value: "\(activity.count) recent",
                    icon: "list.bullet.rectangle.portrait",
                    isHealthy: errorMessage == nil
                )
            }
        }
    }

    private func statusCard(
        title: String,
        value: String,
        icon: String,
        isHealthy: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(.cyan)
                Spacer()
                Circle()
                    .fill(isHealthy ? Color.green : Color.orange)
                    .frame(width: 8, height: 8)
            }

            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 100, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.07))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.cyan.opacity(0.10), lineWidth: 1)
                )
        )
    }

    private var activitySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Recent activity")
                        .font(.title3.weight(.bold))
                    Text("All registered Bob projects")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            if isLoading && activity.isEmpty {
                HStack(spacing: 10) {
                    ProgressView()
                        .tint(.cyan)
                    Text("Loading Bob activity…")
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 20)
            } else if activity.isEmpty {
                emptyState
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(activity) { item in
                        activityRow(item)
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "clock.badge.questionmark")
                .font(.system(size: 28))
                .foregroundStyle(.cyan)
            Text("No activity recorded yet")
                .font(.subheadline.weight(.semibold))
            Text("Context retrievals and future audited Bob actions will appear here.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 18)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.055))
        )
    }

    private func activityRow(_ item: BobCoreClient.ActivityItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(sourceColor(item.source).opacity(0.14))
                    .frame(width: 38, height: 38)
                Image(systemName: sourceIcon(item.source))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(sourceColor(item.source))
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(item.summary)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)

                HStack(spacing: 7) {
                    Text(item.projectName ?? item.projectKey ?? "Bob Core")
                    Text("•")
                    Text(item.source.uppercased())
                    Text("•")
                    Text(relativeTime(item.createdAt))
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)

                Text(item.eventType)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.cyan.opacity(0.85))
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.055))
        )
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 3) {
                Text("Activity unavailable")
                    .font(.subheadline.weight(.semibold))
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.orange.opacity(0.10))
        )
    }

    @MainActor
    private func refresh() async {
        guard configuration.isConfigured else {
            coreStatus = nil
            activity = []
            errorMessage = "Connect Bob Core in Settings to view operational activity."
            return
        }

        isLoading = true
        defer { isLoading = false }

        let client = BobCoreClient(configuration: configuration)

        do {
            async let statusRequest = client.status()
            async let activityRequest = client.activity(limit: 50)
            coreStatus = try await statusRequest
            activity = try await activityRequest
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func sourceIcon(_ source: String) -> String {
        switch source.lowercased() {
        case "codex": return "terminal"
        case "chatgpt": return "bubble.left.and.bubble.right"
        case "bobai": return "iphone"
        case "github": return "arrow.triangle.branch"
        case "vercel": return "cloud"
        case "neon": return "cylinder"
        default: return "bolt.horizontal.circle"
        }
    }

    private func sourceColor(_ source: String) -> Color {
        switch source.lowercased() {
        case "codex": return .purple
        case "chatgpt": return .green
        case "vercel": return .blue
        case "github": return .white
        case "neon": return .indigo
        default: return .cyan
        }
    }

    private func relativeTime(_ isoDate: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: isoDate) else {
            return isoDate
        }

        return RelativeDateTimeFormatter().localizedString(
            for: date,
            relativeTo: Date()
        )
    }
}

#Preview {
    BobControlCenterView(configuration: BobCoreConfiguration())
}

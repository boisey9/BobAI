import SwiftUI

struct HomeView: View {
    @ObservedObject private var configuration: BobCoreConfiguration
    @StateObject private var viewModel: ConversationViewModel
    @State private var isShowingCoreSettings = false

    init(configuration: BobCoreConfiguration) {
        self.configuration = configuration
        _viewModel = StateObject(
            wrappedValue: ConversationViewModel(
                configuration: configuration
            )
        )
    }

    var body: some View {
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

            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 20)
                    .padding(.top, 10)
                    .padding(.bottom, 8)

                if !configuration.isConfigured {
                    demoBanner
                        .padding(.horizontal, 20)
                        .padding(.bottom, 6)
                }

                BobCoreView(
                    state: coreState,
                    transcript: viewModel.speech.transcript,
                    isEnabled: !viewModel.isThinking
                ) {
                    Task { await viewModel.toggleListening() }
                }
                .padding(.top, 4)
                .padding(.bottom, 8)

                conversation

                composer
                    .padding(20)
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            #if DEBUG
            print("[BobAI] HomeView appeared")
            #endif
        }
        .sheet(isPresented: $isShowingCoreSettings) {
            CoreSettingsView(configuration: configuration)
        }
        .alert(
            "BobAI",
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {
                viewModel.errorMessage = nil
            }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    private var coreState: BobCoreState {
        if viewModel.isThinking { return .thinking }
        if viewModel.speech.isListening { return .listening }
        if viewModel.isSpeaking { return .speaking }
        if viewModel.isComplete { return .complete }
        return .idle
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.cyan.opacity(0.12))
                    .frame(width: 42, height: 42)

                Circle()
                    .stroke(Color.cyan.opacity(0.55), lineWidth: 1.2)
                    .frame(width: 31, height: 31)

                Text("B")
                    .font(
                        .system(
                            size: 17,
                            weight: .bold,
                            design: .rounded
                        )
                    )
                    .foregroundStyle(.cyan)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("BOB")
                    .font(.headline.weight(.bold))
                    .tracking(1.4)
                Text("Personal AI")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            StatusPill(
                speech: viewModel.speech,
                isThinking: viewModel.isThinking,
                isSpeaking: viewModel.isSpeaking,
                isComplete: viewModel.isComplete,
                isCoreConfigured: configuration.isConfigured
            )

            Button {
                isShowingCoreSettings = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 34, height: 34)
                    .background(
                        Circle().fill(Color.white.opacity(0.08))
                    )
            }
            .accessibilityLabel("Bob Core Settings")
        }
    }

    private var demoBanner: some View {
        Button {
            isShowingCoreSettings = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "link.badge.plus")
                Text("Demo mode — tap to connect Bob Core")
                    .font(.footnote.weight(.semibold))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
            }
            .foregroundStyle(.cyan)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.cyan.opacity(0.09))
            )
        }
        .buttonStyle(.plain)
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(viewModel.messages) { message in
                        MessageBubble(message: message)
                            .id(message.id)
                    }

                    if viewModel.isThinking {
                        HStack(spacing: 8) {
                            ProgressView()
                                .tint(.cyan)
                            Text("Bob is thinking…")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                            Spacer()
                        }
                        .padding(.horizontal, 4)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
            }
            .onChange(of: viewModel.messages.count) { _, _ in
                guard let lastID = viewModel.messages.last?.id else {
                    return
                }

                withAnimation {
                    proxy.scrollTo(lastID, anchor: .bottom)
                }
            }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField(
                "Ask Bob anything…",
                text: $viewModel.draft,
                axis: .vertical
            )
            .lineLimit(1...4)
            .textFieldStyle(.plain)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white.opacity(0.075))
                    .overlay(
                        RoundedRectangle(
                            cornerRadius: 18,
                            style: .continuous
                        )
                        .stroke(Color.cyan.opacity(0.08), lineWidth: 1)
                    )
            )
            .submitLabel(.send)
            .onSubmit {
                Task { await viewModel.sendDraft() }
            }

            Button {
                Task { await viewModel.sendDraft() }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(
                        Circle().fill(
                            LinearGradient(
                                colors: [.cyan, .blue],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    )
            }
            .disabled(
                viewModel.draft.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty || viewModel.isThinking
            )
            .opacity(
                viewModel.draft.trimmingCharacters(
                    in: .whitespacesAndNewlines
                ).isEmpty ? 0.45 : 1
            )
            .accessibilityLabel("Send message")
        }
    }
}

private struct StatusPill: View {
    @ObservedObject var speech: SpeechRecognizer
    let isThinking: Bool
    let isSpeaking: Bool
    let isComplete: Bool
    let isCoreConfigured: Bool

    private var label: String {
        if isThinking { return "Thinking" }
        if speech.isListening { return "Listening" }
        if isSpeaking { return "Speaking" }
        if isComplete { return "Done" }
        if speech.permissionState == .denied { return "Text only" }
        return isCoreConfigured ? "Core" : "Demo"
    }

    private var indicatorColor: Color {
        if isThinking { return .orange }
        if speech.isListening { return .cyan }
        if isSpeaking { return .blue }
        if isComplete { return .green }
        if speech.permissionState == .denied { return .yellow }
        return isCoreConfigured ? .green : .cyan
    }

    var body: some View {
        HStack(spacing: 7) {
            Circle()
                .fill(indicatorColor)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption.weight(.semibold))
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 7)
        .background(Capsule().fill(Color.white.opacity(0.08)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Bob status: \(label)")
    }
}

#Preview {
    HomeView(configuration: BobCoreConfiguration())
}

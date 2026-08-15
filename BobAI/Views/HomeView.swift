import SwiftUI

struct HomeView: View {
    @StateObject private var viewModel = ConversationViewModel()

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.025, green: 0.035, blue: 0.06),
                    Color(red: 0.055, green: 0.09, blue: 0.16)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 20)
                    .padding(.top, 10)
                    .padding(.bottom, 14)

                conversation

                VoiceCaptureCard(speech: viewModel.speech) {
                    Task { await viewModel.toggleListening() }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                composer
                    .padding(20)
            }
        }
        .preferredColorScheme(.dark)
        .task {
            await viewModel.prepare()
        }
        .alert(
            "BobAI",
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) { viewModel.errorMessage = nil }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.22))
                    .frame(width: 44, height: 44)

                Image(systemName: "waveform")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.blue)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("BOB")
                    .font(.headline.weight(.bold))
                Text("Personal AI")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            StatusPill(speech: viewModel.speech, isThinking: viewModel.isThinking)
        }
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
                guard let lastID = viewModel.messages.last?.id else { return }
                withAnimation {
                    proxy.scrollTo(lastID, anchor: .bottom)
                }
            }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Ask Bob anything…", text: $viewModel.draft, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.plain)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color.white.opacity(0.09))
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
                    .background(Circle().fill(Color.blue))
            }
            .disabled(viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || viewModel.isThinking)
            .opacity(viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
            .accessibilityLabel("Send message")
        }
    }
}

private struct VoiceCaptureCard: View {
    @ObservedObject var speech: SpeechRecognizer
    let action: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Button(action: action) {
                ZStack {
                    Circle()
                        .fill(speech.isListening ? Color.red.opacity(0.2) : Color.blue.opacity(0.2))
                        .frame(width: 76, height: 76)

                    Circle()
                        .fill(speech.isListening ? Color.red : Color.blue)
                        .frame(width: 58, height: 58)

                    Image(systemName: speech.isListening ? "stop.fill" : "mic.fill")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(.white)
                }
            }
            .accessibilityLabel(speech.isListening ? "Stop listening" : "Start listening")

            Text(speech.isListening ? (speech.transcript.isEmpty ? "Listening…" : speech.transcript) : "Tap to talk")
                .font(.footnote)
                .foregroundStyle(speech.isListening ? .primary : .secondary)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .frame(maxWidth: .infinity)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white.opacity(0.055))
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        )
    }
}

private struct StatusPill: View {
    @ObservedObject var speech: SpeechRecognizer
    let isThinking: Bool

    private var label: String {
        if isThinking { return "Thinking" }
        if speech.isListening { return "Listening" }
        if speech.permissionState == .denied { return "Text only" }
        return "Ready"
    }

    private var indicatorColor: Color {
        if isThinking { return .orange }
        if speech.isListening { return .red }
        if speech.permissionState == .denied { return .yellow }
        return .green
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
    HomeView()
}

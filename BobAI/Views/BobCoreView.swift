import SwiftUI

enum BobCoreState: Equatable {
    case idle
    case listening
    case thinking
    case speaking
    case complete

    var label: String {
        switch self {
        case .idle: return "Ready"
        case .listening: return "Listening"
        case .thinking: return "Thinking"
        case .speaking: return "Speaking"
        case .complete: return "Done"
        }
    }

    var subtitle: String {
        switch self {
        case .idle: return "Tap the core and talk to Bob"
        case .listening: return "I’m listening…"
        case .thinking: return "Working on it…"
        case .speaking: return "Bob is speaking"
        case .complete: return "Done"
        }
    }
}

struct BobCoreView: View {
    let state: BobCoreState
    let transcript: String
    let action: () -> Void

    @State private var breathe = false
    @State private var rotate = false
    @State private var pulse = false

    private let cyan = Color(red: 0.10, green: 0.78, blue: 1.0)
    private let electricBlue = Color(red: 0.05, green: 0.32, blue: 1.0)

    var body: some View {
        VStack(spacing: 18) {
            Button(action: action) {
                ZStack {
                    glow
                    outerRings
                    orbitRing
                    core
                    stateGlyph
                }
                .frame(width: 190, height: 190)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(accessibilityLabel)

            VStack(spacing: 6) {
                Text(state.label.uppercased())
                    .font(.caption.weight(.bold))
                    .tracking(2.2)
                    .foregroundStyle(cyan)

                Text(displayText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .frame(maxWidth: 320)
            }
        }
        .onAppear {
            breathe = true
            rotate = true
            pulse = true
        }
    }

    private var glow: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        cyan.opacity(glowOpacity),
                        electricBlue.opacity(0.18),
                        .clear
                    ],
                    center: .center,
                    startRadius: 8,
                    endRadius: 92
                )
            )
            .scaleEffect(breathe ? glowScale : 0.9)
            .animation(
                .easeInOut(duration: animationDuration)
                    .repeatForever(autoreverses: true),
                value: breathe
            )
    }

    private var outerRings: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [cyan.opacity(0.9), electricBlue.opacity(0.25), cyan.opacity(0.65)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: index == 0 ? 2.2 : 1.2
                    )
                    .frame(
                        width: CGFloat(118 + index * 22),
                        height: CGFloat(118 + index * 22)
                    )
                    .opacity(ringOpacity(index))
                    .scaleEffect(ringScale(index))
                    .animation(
                        .easeInOut(duration: animationDuration + Double(index) * 0.25)
                            .repeatForever(autoreverses: true),
                        value: pulse
                    )
            }
        }
    }

    private var orbitRing: some View {
        Circle()
            .trim(from: 0.05, to: 0.78)
            .stroke(
                AngularGradient(
                    colors: [cyan.opacity(0.1), cyan, electricBlue, cyan.opacity(0.1)],
                    center: .center
                ),
                style: StrokeStyle(lineWidth: 2.4, lineCap: .round)
            )
            .frame(width: 146, height: 146)
            .rotationEffect(.degrees(rotate ? rotationDegrees : 0))
            .animation(
                .linear(duration: rotationDuration)
                    .repeatForever(autoreverses: false),
                value: rotate
            )
            .opacity(state == .idle ? 0.45 : 0.95)
    }

    private var core: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [.white, cyan, electricBlue.opacity(0.95)],
                        center: .center,
                        startRadius: 0,
                        endRadius: 44
                    )
                )
                .frame(width: 92, height: 92)
                .shadow(color: cyan.opacity(0.8), radius: 24)

            Circle()
                .stroke(.white.opacity(0.65), lineWidth: 1)
                .frame(width: 72, height: 72)

            Text("B")
                .font(.system(size: 38, weight: .medium, design: .rounded))
                .foregroundStyle(.white)
                .shadow(color: .white.opacity(0.85), radius: 8)
        }
        .scaleEffect(pulse ? coreScale : 0.96)
        .animation(
            .easeInOut(duration: animationDuration)
                .repeatForever(autoreverses: true),
            value: pulse
        )
    }

    @ViewBuilder
    private var stateGlyph: some View {
        if state == .complete {
            Image(systemName: "checkmark")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(.white)
                .offset(y: 58)
                .transition(.scale.combined(with: .opacity))
        }
    }

    private var displayText: String {
        if state == .listening, !transcript.isEmpty {
            return transcript
        }
        return state.subtitle
    }

    private var accessibilityLabel: String {
        switch state {
        case .listening:
            return "Bob is listening. Tap to stop listening."
        default:
            return "Bob Core. Tap to talk."
        }
    }

    private var glowOpacity: Double {
        switch state {
        case .idle: return 0.28
        case .listening: return 0.58
        case .thinking: return 0.45
        case .speaking: return 0.62
        case .complete: return 0.72
        }
    }

    private var glowScale: CGFloat {
        switch state {
        case .idle: return 1.03
        case .listening: return 1.14
        case .thinking: return 1.08
        case .speaking: return 1.16
        case .complete: return 1.10
        }
    }

    private var coreScale: CGFloat {
        switch state {
        case .idle: return 1.02
        case .listening: return 1.08
        case .thinking: return 1.04
        case .speaking: return 1.10
        case .complete: return 1.06
        }
    }

    private var animationDuration: Double {
        switch state {
        case .idle: return 2.4
        case .listening: return 0.85
        case .thinking: return 1.3
        case .speaking: return 0.65
        case .complete: return 0.5
        }
    }

    private var rotationDuration: Double {
        switch state {
        case .thinking: return 1.15
        case .listening: return 2.4
        case .speaking: return 1.8
        default: return 4.8
        }
    }

    private var rotationDegrees: Double {
        state == .thinking ? 720 : 360
    }

    private func ringOpacity(_ index: Int) -> Double {
        let base = state == .idle ? 0.25 : 0.55
        return max(0.12, base - Double(index) * 0.12)
    }

    private func ringScale(_ index: Int) -> CGFloat {
        guard pulse else { return 0.94 }
        switch state {
        case .listening, .speaking:
            return 1.05 + CGFloat(index) * 0.018
        case .thinking:
            return 1.02 + CGFloat(index) * 0.01
        default:
            return 1.0 + CGFloat(index) * 0.008
        }
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        BobCoreView(state: .thinking, transcript: "", action: {})
    }
    .preferredColorScheme(.dark)
}

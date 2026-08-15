import SwiftUI

struct MessageBubble: View {
    let message: ConversationMessage

    var body: some View {
        HStack {
            if message.role == .user {
                Spacer(minLength: 52)
            }

            Text(message.text)
                .font(.body)
                .foregroundStyle(message.role == .user ? Color.white : Color.primary)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(message.role == .user ? Color.blue : Color(.secondarySystemBackground))
                )

            if message.role == .assistant {
                Spacer(minLength: 52)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(message.role == .user ? "You" : "Bob")
        .accessibilityValue(message.text)
    }
}

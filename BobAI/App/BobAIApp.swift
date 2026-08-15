import SwiftUI

@main
struct BobAIApp: App {
    init() {
        #if DEBUG
        print("[BobAI] App initialized")
        #endif
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
        }
    }
}

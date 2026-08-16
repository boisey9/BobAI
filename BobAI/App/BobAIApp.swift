import SwiftUI

@main
struct BobAIApp: App {
    @StateObject private var coreConfiguration =
        BobCoreConfiguration()

    init() {
        #if DEBUG
        print("[BobAI] App initialized")
        #endif
    }

    var body: some Scene {
        WindowGroup {
            HomeView(configuration: coreConfiguration)
        }
    }
}

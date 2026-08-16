#!/usr/bin/env swift

import AppKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

private enum IconGeneratorError: Error {
    case graphicsContextCreationFailed
    case imageCreationFailed
    case destinationCreationFailed
    case pngEncodingFailed
}

private let canvasSize = 1024
private let canvas = CGRect(
    x: 0,
    y: 0,
    width: canvasSize,
    height: canvasSize
)
private let center = CGPoint(x: canvas.midX, y: canvas.midY)

private let defaultOutputPath =
    "BobAI/Resources/Assets.xcassets/AppIcon.appiconset/BobAI-AppIcon-1024.png"
private let requestedOutputPath =
    CommandLine.arguments.dropFirst().first ?? defaultOutputPath
private let outputURL = URL(
    fileURLWithPath: requestedOutputPath,
    relativeTo: URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
).standardizedFileURL

let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue
    | CGImageAlphaInfo.noneSkipLast.rawValue

guard let context = CGContext(
    data: nil,
    width: canvasSize,
    height: canvasSize,
    bitsPerComponent: 8,
    bytesPerRow: canvasSize * 4,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: bitmapInfo
) else {
    throw IconGeneratorError.graphicsContextCreationFailed
}

let graphics = NSGraphicsContext(cgContext: context, flipped: false)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = graphics

context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)

// Opaque black-blue foundation. The Core Graphics bitmap uses noneSkipLast,
// so the exported PNG contains no alpha channel.
context.setFillColor(
    NSColor(
        calibratedRed: 0.003,
        green: 0.008,
        blue: 0.018,
        alpha: 1
    ).cgColor
)
context.fill(canvas)

let backgroundColors = [
    NSColor(
        calibratedRed: 0.015,
        green: 0.105,
        blue: 0.245,
        alpha: 1
    ).cgColor,
    NSColor(
        calibratedRed: 0.005,
        green: 0.025,
        blue: 0.075,
        alpha: 1
    ).cgColor,
    NSColor(
        calibratedRed: 0.001,
        green: 0.004,
        blue: 0.012,
        alpha: 1
    ).cgColor
] as CFArray
let backgroundLocations: [CGFloat] = [0, 0.55, 1]

if let backgroundGradient = CGGradient(
    colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: backgroundColors,
    locations: backgroundLocations
) {
    context.drawRadialGradient(
        backgroundGradient,
        startCenter: center,
        startRadius: 0,
        endCenter: center,
        endRadius: 760,
        options: [.drawsAfterEndLocation]
    )
}

func ringRect(radius: CGFloat) -> CGRect {
    CGRect(
        x: center.x - radius,
        y: center.y - radius,
        width: radius * 2,
        height: radius * 2
    )
}

func drawNeonRing(
    radius: CGFloat,
    lineWidth: CGFloat,
    intensity: CGFloat
) {
    let cyan = NSColor(
        calibratedRed: 0.02,
        green: 0.62,
        blue: 1,
        alpha: 1
    )

    context.saveGState()
    context.setBlendMode(.screen)

    context.setStrokeColor(
        cyan.withAlphaComponent(0.08 * intensity).cgColor
    )
    context.setLineWidth(lineWidth * 7)
    context.strokeEllipse(in: ringRect(radius: radius))

    context.setStrokeColor(
        cyan.withAlphaComponent(0.25 * intensity).cgColor
    )
    context.setLineWidth(lineWidth * 3)
    context.strokeEllipse(in: ringRect(radius: radius))

    context.setStrokeColor(
        NSColor(
            calibratedRed: 0.08,
            green: 0.73,
            blue: 1,
            alpha: 0.92 * intensity
        ).cgColor
    )
    context.setLineWidth(lineWidth)
    context.strokeEllipse(in: ringRect(radius: radius))

    context.setStrokeColor(
        NSColor(
            calibratedRed: 0.72,
            green: 0.96,
            blue: 1,
            alpha: 0.72 * intensity
        ).cgColor
    )
    context.setLineWidth(max(2, lineWidth * 0.22))
    context.strokeEllipse(in: ringRect(radius: radius - lineWidth * 0.28))

    context.restoreGState()
}

// Deterministic energy particles so every generated icon is identical.
context.saveGState()
context.setBlendMode(.screen)
for index in 0..<108 {
    let angle = CGFloat(index) * 2.399963229728653
    let radius = CGFloat(155 + ((index * 71) % 292))
    let particleSize = CGFloat(2 + ((index * 17) % 6))
    let x = center.x + cos(angle) * radius
    let y = center.y + sin(angle) * radius
    let alpha = 0.22 + CGFloat((index * 13) % 58) / 100

    context.setFillColor(
        NSColor(
            calibratedRed: 0.06,
            green: 0.63,
            blue: 1,
            alpha: alpha
        ).cgColor
    )
    context.fillEllipse(
        in: CGRect(
            x: x - particleSize / 2,
            y: y - particleSize / 2,
            width: particleSize,
            height: particleSize
        )
    )
}
context.restoreGState()

drawNeonRing(radius: 360, lineWidth: 10, intensity: 0.86)
drawNeonRing(radius: 246, lineWidth: 8, intensity: 1)
drawNeonRing(radius: 164, lineWidth: 5, intensity: 0.7)

// Add asymmetric energy arcs so the Core feels alive instead of mechanical.
context.saveGState()
context.setBlendMode(.screen)
context.setLineCap(.round)
for arc in [
    (radius: CGFloat(362), start: CGFloat(3.55), end: CGFloat(5.52), width: CGFloat(18)),
    (radius: CGFloat(248), start: CGFloat(0.22), end: CGFloat(1.62), width: CGFloat(12)),
    (radius: CGFloat(248), start: CGFloat(2.78), end: CGFloat(3.82), width: CGFloat(9))
] {
    context.setStrokeColor(
        NSColor(
            calibratedRed: 0.18,
            green: 0.83,
            blue: 1,
            alpha: 0.72
        ).cgColor
    )
    context.setLineWidth(arc.width * 3)
    context.addArc(
        center: center,
        radius: arc.radius,
        startAngle: arc.start,
        endAngle: arc.end,
        clockwise: false
    )
    context.strokePath()

    context.setStrokeColor(
        NSColor(
            calibratedRed: 0.72,
            green: 0.98,
            blue: 1,
            alpha: 0.96
        ).cgColor
    )
    context.setLineWidth(arc.width * 0.34)
    context.addArc(
        center: center,
        radius: arc.radius,
        startAngle: arc.start,
        endAngle: arc.end,
        clockwise: false
    )
    context.strokePath()
}
context.restoreGState()

let coreColors = [
    NSColor(
        calibratedRed: 0.88,
        green: 1,
        blue: 1,
        alpha: 1
    ).cgColor,
    NSColor(
        calibratedRed: 0.02,
        green: 0.72,
        blue: 1,
        alpha: 0.92
    ).cgColor,
    NSColor(
        calibratedRed: 0.01,
        green: 0.18,
        blue: 0.54,
        alpha: 0.15
    ).cgColor
] as CFArray
let coreLocations: [CGFloat] = [0, 0.2, 1]

if let coreGradient = CGGradient(
    colorsSpace: CGColorSpaceCreateDeviceRGB(),
    colors: coreColors,
    locations: coreLocations
) {
    context.saveGState()
    context.setBlendMode(.screen)
    context.drawRadialGradient(
        coreGradient,
        startCenter: center,
        startRadius: 0,
        endCenter: center,
        endRadius: 205,
        options: [.drawsAfterEndLocation]
    )
    context.restoreGState()
}

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let font = NSFont.systemFont(ofSize: 316, weight: .regular)
let letter = "B" as NSString
let letterRect = NSRect(x: 0, y: 326, width: canvasSize, height: 390)

let broadGlow = NSShadow()
broadGlow.shadowColor = NSColor(
    calibratedRed: 0.02,
    green: 0.72,
    blue: 1,
    alpha: 0.95
)
broadGlow.shadowBlurRadius = 52
broadGlow.shadowOffset = .zero
letter.draw(
    in: letterRect,
    withAttributes: [
        .font: font,
        .foregroundColor: NSColor(
            calibratedRed: 0.25,
            green: 0.87,
            blue: 1,
            alpha: 0.4
        ),
        .paragraphStyle: paragraph,
        .shadow: broadGlow
    ]
)

let crispGlow = NSShadow()
crispGlow.shadowColor = NSColor(
    calibratedRed: 0.05,
    green: 0.8,
    blue: 1,
    alpha: 0.9
)
crispGlow.shadowBlurRadius = 18
crispGlow.shadowOffset = .zero
letter.draw(
    in: letterRect,
    withAttributes: [
        .font: font,
        .foregroundColor: NSColor(
            calibratedRed: 0.88,
            green: 0.99,
            blue: 1,
            alpha: 1
        ),
        .paragraphStyle: paragraph,
        .shadow: crispGlow
    ]
)

// A subtle internal frame references the approved concept while leaving enough
// safe area for iOS to apply its own icon mask.
let framePath = NSBezierPath(
    roundedRect: NSRect(x: 28, y: 28, width: 968, height: 968),
    xRadius: 196,
    yRadius: 196
)
framePath.lineWidth = 9
NSColor(
    calibratedRed: 0.13,
    green: 0.2,
    blue: 0.31,
    alpha: 0.62
).setStroke()
framePath.stroke()

NSGraphicsContext.restoreGraphicsState()

try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true,
    attributes: nil
)

guard let image = context.makeImage() else {
    throw IconGeneratorError.imageCreationFailed
}

guard let destination = CGImageDestinationCreateWithURL(
    outputURL as CFURL,
    UTType.png.identifier as CFString,
    1,
    nil
) else {
    throw IconGeneratorError.destinationCreationFailed
}

CGImageDestinationAddImage(destination, image, nil)

guard CGImageDestinationFinalize(destination) else {
    throw IconGeneratorError.pngEncodingFailed
}

print("Generated BobAI app icon at \(outputURL.path)")

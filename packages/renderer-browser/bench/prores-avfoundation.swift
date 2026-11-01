import AVFoundation
import CoreVideo
import Foundation

// A native receiving pipeline, independent of the FFmpeg encoder and decoder.
let arguments = CommandLine.arguments
guard arguments.count == 3 else { fatalError("Usage: prores-avfoundation.swift INPUT.mov OUTPUT.bgra") }
let asset = AVURLAsset(url: URL(fileURLWithPath: arguments[1]))
let tracks = try await asset.loadTracks(withMediaType: .video)
guard let track = tracks.first else { fatalError("No video track in ProRes fixture") }
let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
])
guard reader.canAdd(output) else { fatalError("AVAssetReader rejected BGRA output") }
reader.add(output)
guard reader.startReading() else { throw reader.error! }
FileManager.default.createFile(atPath: arguments[2], contents: nil)
let file = try FileHandle(forWritingTo: URL(fileURLWithPath: arguments[2]))
var timestamps: [Double] = []
var attachments = ""
while let sample = output.copyNextSampleBuffer() {
    guard let pixels = CMSampleBufferGetImageBuffer(sample) else { fatalError("No decoded pixels") }
    CVPixelBufferLockBaseAddress(pixels, .readOnly)
    guard let base = CVPixelBufferGetBaseAddress(pixels) else { fatalError("No decoded buffer address") }
    let width = CVPixelBufferGetWidth(pixels)
    let height = CVPixelBufferGetHeight(pixels)
    let stride = CVPixelBufferGetBytesPerRow(pixels)
    for row in 0..<height {
        try file.write(contentsOf: Data(bytes: base.advanced(by: row * stride), count: width * 4))
    }
    if timestamps.isEmpty { attachments = String(describing: CVBufferCopyAttachments(pixels, .shouldPropagate)) }
    CVPixelBufferUnlockBaseAddress(pixels, .readOnly)
    timestamps.append(CMSampleBufferGetPresentationTimeStamp(sample).seconds)
}
try file.close()
guard reader.status == .completed else { throw reader.error! }
let descriptions = try await track.load(.formatDescriptions)
let report: [String: Any] = [
    "receiver": "AVFoundation AVAssetReader / 32BGRA",
    "os": ProcessInfo.processInfo.operatingSystemVersionString,
    "containsAlpha": track.hasMediaCharacteristic(.containsAlphaChannel),
    "formatExtensions": descriptions.map { String(describing: CMFormatDescriptionGetExtensions($0)) },
    "pixelAttachments": attachments,
    "frames": timestamps.count,
    "timestamps": timestamps
]
let json = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
print(String(data: json, encoding: .utf8)!)

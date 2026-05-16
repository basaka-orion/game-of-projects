// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WormholeLandlord",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "WormholeLandlord", targets: ["WormholeLandlord"])
    ],
    targets: [
        .executableTarget(
            name: "WormholeLandlord",
            path: "Sources/WormholeLandlord"
        ),
        .testTarget(
            name: "WormholeLandlordTests",
            dependencies: ["WormholeLandlord"],
            path: "Tests/WormholeLandlordTests"
        )
    ]
)

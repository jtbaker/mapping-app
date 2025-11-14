import { createFileRoute } from "@tanstack/react-router";
import {
	Route as RouteIcon,
	Server,
	Shield,
	Sparkles,
	Waves,
	Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import Map, { Layer, Popup, Source } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
// import { VectorTileSource } from "maplibre-gl";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: App });

function App() {
	const [hoverInfo, setHoverInfo] = useState(null);
	const mapRef = useRef<Map>(null);
	const [cursor, setCursor] = useState("grab");
	const features = [
		{
			icon: <Zap className="w-12 h-12 text-cyan-400" />,
			title: "Powerful Server Functions",
			description:
				"Write server-side code that seamlessly integrates with your client components. Type-safe, secure, and simple.",
		},
		{
			icon: <Server className="w-12 h-12 text-cyan-400" />,
			title: "Flexible Server Side Rendering",
			description:
				"Full-document SSR, streaming, and progressive enhancement out of the box. Control exactly what renders where.",
		},
		{
			icon: <RouteIcon className="w-12 h-12 text-cyan-400" />,
			title: "API Routes",
			description:
				"Build type-safe API endpoints alongside your application. No separate backend needed.",
		},
		{
			icon: <Shield className="w-12 h-12 text-cyan-400" />,
			title: "Strongly Typed Everything",
			description:
				"End-to-end type safety from server to client. Catch errors before they reach production.",
		},
		{
			icon: <Waves className="w-12 h-12 text-cyan-400" />,
			title: "Full Streaming Support",
			description:
				"Stream data from server to client progressively. Perfect for AI applications and real-time updates.",
		},
		{
			icon: <Sparkles className="w-12 h-12 text-cyan-400" />,
			title: "Next Generation Ready",
			description:
				"Built from the ground up for modern web applications. Deploy anywhere JavaScript runs.",
		},
	];

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
			<section className="py-16 px-6 mx-auto text-gray-200 text-center">
				<div>
					<h3>TTE Maplibre Demo</h3>
				</div>
			</section>
			<section className="px-6 max-w-7xl mx-auto">
				<div>
					<Map
						ref={mapRef}
						initialViewState={{
							longitude: -100,
							latitude: 30,
							zoom: 5,
						}}
						cursor={cursor}
						style={{ width: "100%", height: 600 }}
						mapStyle="https://tiles.openfreemap.org/styles/positron"
						interactiveLayerIds={["out", "lmp"]}
						onMouseMove={(event) => {
							mapRef.current.getMap().getContainer().style.cursor = "pointer";
							const feature = event.features && event.features[0];
							if (feature) {
								// debugger;
								setCursor("pointer");
								setHoverInfo({
									longitude: event.lngLat.lng,
									latitude: event.lngLat.lat,
									info:
										feature.properties.name ||
										Object.entries(
											feature.properties.tags_json
												? JSON.parse(feature.properties.tags_json)
												: feature.properties,
										)
											.map(
												([k, v]) =>
													`<tr><th style="text-align: left; padding: 2px;">${k}</th><td>${v}</td></tr>`,
											)
											.join(""),
								});
							} else {
								setHoverInfo(null);
								setCursor("grab");
							}
						}}
					>
						{hoverInfo && (
							<Popup
								longitude={hoverInfo.longitude}
								latitude={hoverInfo.latitude}
								closeButton={false}
								closeOnClick={false}
								anchor="bottom"
								offset={[0, -10]}
							>
								<div>
									<table dangerouslySetInnerHTML={{ __html: hoverInfo.info }} />
								</div>
							</Popup>
						)}
						<Source
							url="https://tiles.jtbaker.dev/grid_elements.json"
							type="vector"
						>
							<Layer
								id="out"
								type="line"
								source-layer="out"
								filter={[
									"any",
									["==", ["geometry-type"], "LineString"],
									["==", ["geometry-type"], "MultiLineString"],
								]}
								paint={{
									"line-width": [
										"interpolate",
										["linear"],
										["zoom"],
										4,
										0.5,
										14,
										3,
									],
									"line-color": "blue",
									"line-opacity": 0.4,
								}}
								layout={{
									visibility: "visible",
								}}
							></Layer>
						</Source>
						<Source url="https://tiles.jtbaker.dev/_big_lmp.json" type="vector">
							<Layer
								type="circle"
								id="lmp"
								source-layer="big_LMP_set"
								paint={{
									"circle-radius": [
										"interpolate",
										["linear"],
										["zoom"],
										4,
										0.5,
										12,
										4,
									],
									"circle-color": "green",
								}}
								layout={{ visibility: "visible" }}
							></Layer>
						</Source>
					</Map>
				</div>
				{/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"> */}
				{/* {features.map((feature, index) => (
						<div
							key={feature.title}
							className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
						>
							<div className="mb-4">{feature.icon}</div>
							<h3 className="text-xl font-semibold text-white mb-3">
								{feature.title}
							</h3>
							<p className="text-gray-400 leading-relaxed">
								{feature.description}
							</p>
						</div>
					))} */}
				{/* </div> */}
			</section>
		</div>
	);
}

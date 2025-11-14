/** biome-ignore-all lint/correctness/useUniqueElementIds: <explanation> */
import { createFileRoute } from "@tanstack/react-router";
import {
	Route as RouteIcon,
	Server,
	Shield,
	Sparkles,
	Waves,
	Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
	MapLayerMouseEvent,
	MapRef,
	MapSourceDataEvent,
} from "react-map-gl/maplibre";

import Map, {
	FullscreenControl,
	GeolocateControl,
	Layer,
	Popup,
	ScaleControl,
	Source,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { cellToBoundary, latLngToCell } from "h3-js";
import { GeoJSONSource } from "maplibre-gl";
// import { VectorTileSource } from "maplibre-gl";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: App });

function sanitizeSource(source) {
	const clone = { ...source };
	delete clone["data-tsd-source"];
	return clone;
}

// Determine H3 resolution based on zoom level
function getH3ResolutionForZoom(zoom: number): number {
	if (zoom >= 8) return 6;
	if (zoom >= 7) return 5;
	if (zoom >= 6) return 4;
	return 4;
}

// Hook to fetch LMP data and aggregate to H3 hexagons
function useH3LMPAggregation(
	mapRef: React.RefObject<MapRef | null>,
	sourceId: string,
	sourceLayer: string,
	mapReady: boolean,
) {
	// biome-ignore lint/suspicious/noExplicitAny: GeoJSON types are complex
	const [hexagonGeoJSON, setHexagonGeoJSON] = useState({
		type: "FeatureCollection",
		features: [],
	});
	const [zoom, setZoom] = useState(5);

	// Handle zoom changes
	useEffect(() => {
		console.log("Zoom effect running", {
			mapReady,
			hasMapRef: !!mapRef.current,
		});
		if (!mapReady || !mapRef.current) return;

		const map = mapRef.current.getMap();
		if (!map) return;

		const handleZoomEnd = () => {
			console.log("Zoom ended, new zoom:", map.getZoom());
			setZoom(map.getZoom());
		};

		map.on("zoomend", handleZoomEnd);
		return () => {
			map.off("zoomend", handleZoomEnd);
		};
	}, [mapRef, mapReady]);

	useEffect(() => {
		console.log("Main effect running", {
			mapReady,
			hasMapRef: !!mapRef.current,
			sourceId,
			sourceLayer,
			zoom,
		});

		if (!mapReady || !mapRef.current) {
			console.error("Map not ready yet", {
				mapReady,
				hasMapRef: !!mapRef.current,
			});
			return;
		}

		const mapInstance = mapRef.current.getMap();
		if (!mapInstance) {
			console.error("map didn't exist, returning early");
			return;
		}
		console.info("✓ Found the map!");

		const aggregateData = () => {
			const h3Resolution = getH3ResolutionForZoom(mapRef.current?.getZoom());
			console.log(`getting aggregation data for h3 zoom ${zoom}`);
			// Query all rendered features from the source
			const features =
				mapRef.current?.querySourceFeatures(sourceId, {
					sourceLayer,
				}) || [];

			console.log(`Found ${features.length} features from source ${sourceId}`);

			if (features.length === 0) {
				setHexagonGeoJSON({ type: "FeatureCollection", features: [] });
				return;
			}

			// Aggregate LMP values by H3 cell
			const h3Data: {
				[hexId: string]: { sum: number; count: number; lmp?: number };
			} = {};

			for (const feature of features) {
				// Get coordinates
				let coords: [number, number] | null = null;

				if (feature.geometry.type === "Point") {
					coords = feature.geometry.coordinates as [number, number];
				} else if (feature.geometry.type === "LineString") {
					// For lines, use the midpoint
					const coordinates = feature.geometry.coordinates as [
						number,
						number,
					][];
					const midIdx = Math.floor(coordinates.length / 2);
					coords = coordinates[midIdx];
				}

				if (!coords) continue;

				// Get LMP value from properties
				const lmpValue = feature.properties?.lmp || feature.properties?.LMP;
				if (lmpValue === undefined || lmpValue === null) continue;

				// Convert to H3 cell
				const h3Index = latLngToCell(coords[1], coords[0], h3Resolution);

				// Aggregate
				if (!h3Data[h3Index]) {
					h3Data[h3Index] = { sum: 0, count: 0 };
				}
				h3Data[h3Index].sum += Number(lmpValue);
				h3Data[h3Index].count += 1;
			}

			// Calculate averages and convert to GeoJSON
			const hexFeatures = Object.entries(h3Data).map(
				([h3Index, data], index) => {
					const avgLMP = data.sum / data.count;
					const boundary = cellToBoundary(h3Index, true); // true for GeoJSON format [lng, lat]

					return {
						type: "Feature" as const,
						id: index,
						properties: {
							h3Index,
							lmp: avgLMP,
							count: data.count,
						},
						geometry: {
							type: "Polygon" as const,
							coordinates: [boundary],
						},
					};
				},
			);

			const geoJSON = {
				type: "FeatureCollection" as const,
				features: hexFeatures,
			};

			console.log(
				"Setting hexagonGeoJSON with",
				hexFeatures.length,
				"hexagons",
			);
			setHexagonGeoJSON(geoJSON);

			const m = mapRef.current.getMap();
			let s: GeoJSONSource | undefined = m.getSource("h3");
			if (!s) {
				s = m.addSource("h3", { type: "geojson", data: geoJSON });
			} else {
				s.setData(geoJSON);
			}
			if (!m.getLayer("h3")) {
				// const firstLayerId = m.getStyle().layers[0].id;
				m.addLayer({
					id: "h3",
					source: "h3",
					type: "fill-extrusion",
					paint: {
						"fill-extrusion-color": [
							"interpolate",
							["linear"],
							["get", "lmp"],
							40,
							"#eff3ff",
							50,
							"#bdd7e7",
							60,
							"#6baed6",
							70,
							"#3182bd",
							80,
							"#08519c",
						],
						"fill-extrusion-opacity": 0.8,
						"fill-extrusion-height": [
							"interpolate",
							["linear"],
							["zoom"],
							4,
							["*", 10000, ["ln", ["get", "count"]]],
							10,
							["*", 500, ["ln", ["get", "count"]]],
						],
					},
					layout: { visibility: "visible" },
				});
				m.addLayer({
					id: "h3-line",
					source: "h3",
					type: "line",
					paint: {
						"line-color": "#101010",
						"line-opacity": [
							"case",
							["boolean", ["feature-state", "hover"], false],
							0.75, // opacity if hovered
							0.4, // opacity if not hovered
						],
						"line-width": [
							"interpolate",
							["linear"], // or "exponential" if needed
							["zoom"],
							4,
							[
								"case",
								["boolean", ["feature-state", "hover"], false],
								2, // width at zoom 4 when hovered
								0.5, // width at zoom 4 when not hovered
							],
							12,
							[
								"case",
								["boolean", ["feature-state", "hover"], false],
								2, // width at zoom 12 when hovered
								1, // width at zoom 12 when not hovered
							],
						],
					},
					layout: {
						visibility: "visible",
					},
				});
				m.moveLayer("h3-line", "out");
				// m.moveLayer("h3", "h3-line");
			}
		};

		// Listen for source data changes
		// biome-ignore lint/suspicious/noExplicitAny: MapLibre event type
		const handleSourceData = (event: MapSourceDataEvent) => {
			console.log("Source data event:", {
				eventSourceId: event.sourceId,
				expectedSourceId: sourceId,
				isSourceLoaded: event.isSourceLoaded,
				dataType: event.dataType,
			});
			if (event.sourceId === sourceId && event.sourceDataChanged) {
				console.log("✓ Aggregating data for source:", sourceId);
				aggregateData();
			}
		};

		console.log("Setting up event listeners for", sourceId);
		// Aggregate data on source data change and map movement
		mapInstance.on("sourcedata", handleSourceData);
		mapInstance.on("moveend", aggregateData);
		mapInstance.on("dragend", aggregateData);
		mapInstance.on("zoomend", aggregateData);
		mapInstance.on("load", aggregateData);

		return () => {
			console.log("Cleaning up event listeners");
			// mapInstance.off("sourcedata", handleSourceData);
			// mapInstance.off("moveend", aggregateData);
		};
	}, [mapReady, zoom]);

	return hexagonGeoJSON;
}

function App() {
	const [hoverInfo, setHoverInfo] = useState<{
		longitude: number;
		latitude: number;
		info: string;
	} | null>(null);
	const mapRef = useRef<MapRef>(null);
	const [cursor, setCursor] = useState("grab");
	const [mapReady, setMapReady] = useState(false);

	// Check when mapRef gets populated
	useEffect(() => {
		console.log("Checking mapRef:", !!mapRef.current);
		if (mapRef.current) {
			console.log("mapRef.current is set!");
			const map = mapRef.current.getMap();
			console.log("Got map from ref:", !!map);
			if (map) {
				console.log("Map loaded status:", map.loaded());
				if (!mapReady && map.loaded()) {
					console.log("Map is loaded, setting mapReady to true");
					setMapReady(true);
				}
			}
		}
	});

	// Use the hook to aggregate LMP data from the 'out' layer
	const h3GeoJSON = useH3LMPAggregation(
		mapRef,
		"big_LMP_set",
		"big_LMP_set",
		mapReady,
	);

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

	console.log("App rendering, mapReady:", mapReady);

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
			<section className="py-16 px-6 mx-auto text-gray-200 text-center">
				<div className="flex flex-col justify-center items-center">
					<h3>TTE Maplibre Demo</h3>
					<p className="text-xs text-left w-3xl">
						Pan and zoom around on the map to dynamically aggregate LMP
						observations to H3 Hexagons. The color is driven by the the average
						of the price of the LMP observations within the cell, while the
						extrusion height is driven by the count of observations used to
						calculate the average.
					</p>
				</div>
			</section>
			<section className="px-6 max-w-7xl mx-auto">
				<div>
					<Map
						ref={mapRef}
						hash={true}
						initialViewState={{
							longitude: -100,
							latitude: 30,
							zoom: 5,
							pitch: 45,
						}}
						cursor={cursor}
						style={{ width: "100%", height: 600 }}
						mapStyle="https://tiles.openfreemap.org/styles/positron"
						interactiveLayerIds={["out", "lmp", "h3"]}
						onLoad={(evt) => {
							console.log("Map onLoad callback fired", evt);
							setMapReady(true);
						}}
						onError={(evt) => {
							console.error("Map error:", evt);
						}}
						onMouseLeave={(event: MapLayerMouseEvent) => {
							if (event.features && event.features[0] !== undefined) {
								const feature = event.features[0];
								mapRef.current?.getMap().removeFeatureState({
									source: feature.source,
									sourceLayer: feature.sourceLayer,
								});
							}
						}}
						onMouseMove={(event: MapLayerMouseEvent) => {
							const feature = event.features?.[0];
							if (feature) {
								setCursor("pointer");
								if (feature.id) {
									const m = mapRef.current?.getMap();
									m?.removeFeatureState({
										source: feature.source,
										sourceLayer: feature.sourceLayer,
									});
									m.setFeatureState(feature, { hover: true });
								}

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
						<GeolocateControl position="bottom-right" />
						{/* <NavigationControl /> */}
						<ScaleControl position="top-right" />
						<FullscreenControl position="top-right" />
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
							{/* <Layer
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
							></Layer> */}
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
										[
											"case",
											["boolean", ["feature-state", "hover"], false],
											1, // width at zoom 4 if hovered
											0.5, // if not hovered
										],
										14,
										[
											"case",
											["boolean", ["feature-state", "hover"], false],
											6, // width at zoom 14 if hovered
											3, // if not hovered
										],
									],
									"line-color": "blue",
									"line-opacity": [
										"case",
										["boolean", ["feature-state", "hover"], false],
										0.75, // opacity if hovered
										0.4, // opacity if not hovered
									],
								}}
								layout={{
									visibility: "visible",
								}}
							/>
						</Source>
						<Source
							id="big_LMP_set"
							url="https://tiles.jtbaker.dev/big_lmp.json"
							type="vector"
						>
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
										[
											"case",
											["boolean", ["feature-state", "hover"], false],
											2, // radius at zoom 4 if hovered
											0.5, // radius at zoom 4 if not hovered
										],
										12,
										[
											"case",
											["boolean", ["feature-state", "hover"], false],
											6, // radius at zoom 12 if hovered
											4, // radius at zoom 12 if not hovered
										],
									],
									"circle-color": "green",
									"circle-opacity": [
										"case",
										["boolean", ["feature-state", "hover"], false],
										0.85,
										0.4,
									],
								}}
								layout={{ visibility: "visible" }}
							/>
						</Source>
					</Map>
				</div>
			</section>
		</div>
	);
}

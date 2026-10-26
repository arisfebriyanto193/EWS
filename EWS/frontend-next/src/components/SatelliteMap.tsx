'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Layers, LocateFixed, MapPin, ZoomIn, ZoomOut } from 'lucide-react';

interface SatelliteMapProps {
  latitude: number;
  longitude: number;
  stationName?: string;
  stationId?: string;
  stationStatus?: string;
  height?: string | number;
  zoom?: number;
  interactive?: boolean;
  onCoordinatesChange?: (lat: number, lng: number) => void;
  showControls?: boolean;
}

export const SatelliteMap: React.FC<SatelliteMapProps> = ({
  latitude,
  longitude,
  stationName = 'Stasiun EWS',
  stationId = '',
  stationStatus = 'aman',
  height = '320px',
  zoom = 16,
  interactive = true,
  onCoordinatesChange,
  showControls = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);

  const [mapType, setMapType] = useState<'satellite' | 'streets'>('satellite');
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [isMapReady, setIsMapReady] = useState<boolean>(false);

  const isValidCoords =
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0);

  // Status color mapping for custom pin
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'bahaya':
        return { bg: '#dc2626', ring: 'rgba(220, 38, 38, 0.45)', text: 'BAHAYA' };
      case 'siaga':
        return { bg: '#d97706', ring: 'rgba(217, 119, 6, 0.45)', text: 'SIAGA' };
      case 'baterai_lemah':
        return { bg: '#ea580c', ring: 'rgba(234, 88, 12, 0.45)', text: 'BATERAI LEMAH' };
      case 'offline':
        return { bg: '#64748b', ring: 'rgba(100, 116, 139, 0.45)', text: 'OFFLINE' };
      default:
        return { bg: '#16a34a', ring: 'rgba(22, 163, 74, 0.45)', text: 'AMAN' };
    }
  };

  useEffect(() => {
    let isCancelled = false;

    if (!isValidCoords || !mapContainerRef.current) return;

    async function initLeafletMap() {
      try {
        const L = (await import('leaflet')).default;
        await import('leaflet/dist/leaflet.css');

        if (isCancelled || !mapContainerRef.current) return;

        // Cleanup existing map instance if any
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        const map = L.map(mapContainerRef.current, {
          center: [latitude, longitude],
          zoom: zoom,
          zoomControl: false, // Custom controls
          attributionControl: false,
          scrollWheelZoom: interactive,
          dragging: interactive,
          doubleClickZoom: interactive,
          touchZoom: interactive,
        });

        // Layer 1: Esri World Imagery (Free high-resolution satellite imagery)
        const satelliteLayer = L.tileLayer(
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
          }
        );

        // Layer 2: Esri World Boundaries and Places (Roads and labels overlay on top of satellite)
        const labelsLayer = L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          {
            maxZoom: 19,
            opacity: 0.85,
          }
        );

        // Layer 3: OpenStreetMap Standard Street Map
        const streetsLayer = L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
          }
        );

        if (mapType === 'satellite') {
          satelliteLayer.addTo(map);
          tileLayerRef.current = satelliteLayer;
          if (showLabels) {
            labelsLayer.addTo(map);
            labelsLayerRef.current = labelsLayer;
          }
        } else {
          streetsLayer.addTo(map);
          tileLayerRef.current = streetsLayer;
        }

        // Custom pulsing HTML marker
        const statusInfo = getStatusColor(stationStatus);
        const customMarkerHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="
              width: 24px;
              height: 24px;
              background-color: ${statusInfo.bg};
              border: 3px solid #ffffff;
              border-radius: 50%;
              box-shadow: 0 0 0 4px ${statusInfo.ring}, 0 4px 8px rgba(0,0,0,0.5);
              position: relative;
              z-index: 2;
            "></div>
            <div style="
              background: rgba(15, 23, 42, 0.9);
              color: #ffffff;
              font-family: monospace;
              font-size: 10px;
              font-weight: 700;
              padding: 2px 6px;
              border-radius: 4px;
              border: 1px solid rgba(255,255,255,0.25);
              margin-top: 3px;
              white-space: nowrap;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">
              ${stationId || 'EWS'}
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          html: customMarkerHtml,
          className: 'custom-ews-marker',
          iconSize: [28, 48],
          iconAnchor: [14, 12],
          popupAnchor: [0, -14],
        });

        const marker = L.marker([latitude, longitude], {
          icon: customIcon,
          draggable: !!onCoordinatesChange,
        }).addTo(map);

        const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const popupContent = `
          <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 12px; min-width: 180px; color: #0f172a;">
            <div style="font-weight: bold; font-size: 13px; color: #1e293b; margin-bottom: 2px;">
              ${stationName}
            </div>
            <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">
              ID: <strong>${stationId}</strong> | Status: <strong style="color: ${statusInfo.bg}; text-transform: uppercase;">${statusInfo.text}</strong>
            </div>
            <div style="background: #f1f5f9; padding: 4px 6px; border-radius: 4px; font-family: monospace; font-size: 11px; margin-bottom: 6px;">
              Lat: ${latitude.toFixed(6)}<br/>Lng: ${longitude.toFixed(6)}
            </div>
            <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
              Buka Google Maps &rarr;
            </a>
          </div>
        `;
        marker.bindPopup(popupContent);

        if (onCoordinatesChange) {
          marker.on('dragend', (evt: any) => {
            const newPos = evt.target.getLatLng();
            onCoordinatesChange(parseFloat(newPos.lat.toFixed(6)), parseFloat(newPos.lng.toFixed(6)));
          });

          map.on('click', (evt: any) => {
            const { lat, lng } = evt.latlng;
            marker.setLatLng([lat, lng]);
            onCoordinatesChange(parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6)));
          });
        }

        markerRef.current = marker;
        mapInstanceRef.current = map;
        setIsMapReady(true);
      } catch (err) {
        console.error('Failed to initialize Leaflet Satellite Map:', err);
      }
    }

    initLeafletMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isValidCoords, latitude, longitude, stationStatus, stationId, stationName]);

  // Handle map style switch (Satellite vs Streets)
  const handleToggleMapType = async () => {
    if (!mapInstanceRef.current) return;
    const L = (await import('leaflet')).default;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    if (labelsLayerRef.current) {
      map.removeLayer(labelsLayerRef.current);
      labelsLayerRef.current = null;
    }

    if (mapType === 'satellite') {
      const streetsLayer = L.tileLayer(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }
      ).addTo(map);
      tileLayerRef.current = streetsLayer;
      setMapType('streets');
    } else {
      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          attribution: 'Tiles &copy; Esri',
        }
      ).addTo(map);
      tileLayerRef.current = satelliteLayer;

      if (showLabels) {
        const labelsLayer = L.tileLayer(
          'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          { maxZoom: 19, opacity: 0.85 }
        ).addTo(map);
        labelsLayerRef.current = labelsLayer;
      }

      setMapType('satellite');
    }
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleCenterMarker = () => {
    if (mapInstanceRef.current && isValidCoords) {
      mapInstanceRef.current.setView([latitude, longitude], zoom, { animate: true });
      markerRef.current?.openPopup();
    }
  };

  if (!isValidCoords) {
    return (
      <div
        style={{ height }}
        className="w-full rounded-xl bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-4 text-center"
      >
        <MapPin className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-1" />
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
          Koordinat GPS Belum Valid
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs mt-0.5">
          Masukkan nilai Latitude (-90 s/d 90) dan Longitude (-180 s/d 180) yang valid untuk memuat citra satelit.
        </p>
      </div>
    );
  }

  const googleMapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xs group">
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{ height, width: '100%' }}
        className="z-0 bg-slate-900"
      />

      {/* Top Banner / Attribution Badge */}
      <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700/60 text-white shadow-md pointer-events-auto">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-bold tracking-wide uppercase font-mono">
          {mapType === 'satellite' ? 'Citra Satelit ' : 'Peta Jalan OSM'}
        </span>
        <span className="text-[9px] text-slate-400 border-l border-slate-700 pl-1.5 font-mono">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </span>
      </div>

      {/* Floating Controls Overlay */}
      {showControls && (
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 pointer-events-auto">
          {/* Layer Switcher */}
          <button
            type="button"
            onClick={handleToggleMapType}
            className="p-1.5 rounded-lg bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-slate-700/60 backdrop-blur-md shadow-md text-xs flex items-center gap-1 transition-colors cursor-pointer"
            title={mapType === 'satellite' ? 'Beralih ke Peta Jalan' : 'Beralih ke Citra Satelit'}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold hidden sm:inline">
              {mapType === 'satellite' ? 'Peta Satelit' : 'Peta Jalan'}
            </span>
          </button>

          {/* Center to Pin */}
          <button
            type="button"
            onClick={handleCenterMarker}
            className="p-1.5 rounded-lg bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-slate-700/60 backdrop-blur-md shadow-md transition-colors cursor-pointer"
            title="Pusatkan ke Titik EWS"
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </button>

          {/* Zoom Buttons */}
          <div className="flex flex-col bg-slate-900/85 rounded-lg border border-slate-700/60 backdrop-blur-md shadow-md overflow-hidden">
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer border-b border-slate-700/60"
              title="Perbesar"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer"
              title="Perkecil"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* External Google Maps Button */}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-slate-700/60 backdrop-blur-md shadow-md transition-colors cursor-pointer"
            title="Buka di Google Maps"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Helper text footer if draggable */}
      {onCoordinatesChange && (
        <div className="absolute bottom-2 left-2 right-2 z-10 pointer-events-none flex justify-center">
          <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700/60 text-white text-[10px] shadow-lg">
            💡 Geser pin atau klik di peta untuk memperbarui koordinat Latitude & Longitude
          </div>
        </div>
      )}
    </div>
  );
};

export default SatelliteMap;

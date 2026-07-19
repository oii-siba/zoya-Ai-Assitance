import React, { useEffect, useRef } from 'react';
import type { SessionState } from '../types/live';
import { AudioStreamer } from '../services/AudioStreamer';

interface WaveformProps {
  state: SessionState;
  audioStreamer: AudioStreamer | null;
}

export const Waveform: React.FC<WaveformProps> = ({ state, audioStreamer }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Rotation phase for connecting animation
    let rotationAngle = 0;

    const draw = () => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // 1. Base breathing orb
      const baseRadius = 65;
      const time = Date.now();
      const pulseSpeed = state === 'speaking' ? 180 : state === 'listening' ? 250 : 400;
      const breathingPulse = Math.sin(time / pulseSpeed) * (state === 'disconnected' ? 4 : 8);
      const radius = baseRadius + breathingPulse;

      // Draw shadow and neon glow behind the orb
      ctx.save();
      ctx.shadowColor =
        state === 'speaking'
          ? 'rgba(236, 72, 153, 0.6)' // Pink-500
          : state === 'listening'
          ? 'rgba(6, 182, 212, 0.6)' // Cyan-500
          : state === 'connecting'
          ? 'rgba(168, 85, 247, 0.4)' // Purple-500
          : 'rgba(99, 102, 241, 0.3)'; // Indigo-500
      ctx.shadowBlur = state === 'disconnected' ? 25 : 45;

      const radialGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        radius
      );

      if (state === 'speaking') {
        radialGrad.addColorStop(0, 'rgba(236, 72, 153, 0.8)'); // Pink
        radialGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.4)'); // Purple
        radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else if (state === 'listening') {
        radialGrad.addColorStop(0, 'rgba(6, 182, 212, 0.8)'); // Cyan
        radialGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.4)'); // Indigo
        radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else if (state === 'connecting') {
        radialGrad.addColorStop(0, 'rgba(168, 85, 247, 0.6)'); // Purple
        radialGrad.addColorStop(0.6, 'rgba(236, 72, 153, 0.2)'); // Pink
        radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        radialGrad.addColorStop(0, 'rgba(99, 102, 241, 0.4)'); // Indigo
        radialGrad.addColorStop(0.7, 'rgba(168, 85, 247, 0.1)'); // Purple
        radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      ctx.fillStyle = radialGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. State-Specific Visualizations
      if (state === 'disconnected') {
        // Draw static subtle particles floating around the orb
        const numParticles = 4;
        ctx.fillStyle = 'rgba(168, 85, 247, 0.5)';
        for (let i = 0; i < numParticles; i++) {
          const angle = (i / numParticles) * Math.PI * 2 + time / 1500;
          const pRadius = radius + 15 + Math.sin(time / 200 + i) * 3;
          const px = centerX + Math.cos(angle) * pRadius;
          const py = centerY + Math.sin(angle) * pRadius;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (state === 'connecting') {
        // Draw rotating neon dash rings
        rotationAngle += 0.04;
        ctx.save();
        ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
        ctx.shadowBlur = 15;
        ctx.lineWidth = 3;

        // Outer Ring
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 15, rotationAngle, rotationAngle + Math.PI / 3);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(
          centerX,
          centerY,
          radius + 15,
          rotationAngle + Math.PI,
          rotationAngle + Math.PI + Math.PI / 3
        );
        ctx.stroke();

        // Inner Ring (reversing direction)
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          centerX,
          centerY,
          radius + 8,
          -rotationAngle * 1.5,
          -rotationAngle * 1.5 + Math.PI / 4
        );
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(
          centerX,
          centerY,
          radius + 8,
          -rotationAngle * 1.5 + Math.PI,
          -rotationAngle * 1.5 + Math.PI + Math.PI / 4
        );
        ctx.stroke();
        ctx.restore();
      } else if (state === 'listening' && audioStreamer) {
        // Cyan-to-purple radial frequencies (User speaking / listening state)
        const freqData = audioStreamer.getInputFrequencyData();
        const numPoints = 90;
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(6, 182, 212, 0.8)';
        ctx.lineWidth = 2.5;

        // Create colorful gradient for the stroke
        const strokeGrad = ctx.createLinearGradient(0, 0, width, height);
        strokeGrad.addColorStop(0, '#06b6d4'); // Cyan
        strokeGrad.addColorStop(1, '#a855f7'); // Purple
        ctx.strokeStyle = strokeGrad;

        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const dataIdx = Math.floor((i / numPoints) * (freqData.length * 0.7));
          const val = freqData[dataIdx] || 0;
          // Scale offset: keep it responsive but neat
          const amplitude = (val / 255) * 45;
          
          // Add a tiny noise wave for when the user is quiet
          const noise = Math.sin(time / 80 + i) * 1.5;
          const r = radius + amplitude + noise + 10;

          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      } else if (state === 'speaking' && audioStreamer) {
        // Pink-to-magenta dual concentric waves (AI talking state)
        const freqData = audioStreamer.getOutputFrequencyData();
        const numPoints = 120;
        ctx.save();

        // Wave 1: Core outer frequency ring
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'rgba(236, 72, 153, 0.9)';
        ctx.lineWidth = 3;
        
        const strokeGrad1 = ctx.createLinearGradient(0, 0, width, height);
        strokeGrad1.addColorStop(0, '#ec4899'); // Pink
        strokeGrad1.addColorStop(0.5, '#ef4444'); // Red
        strokeGrad1.addColorStop(1, '#a855f7'); // Purple
        ctx.strokeStyle = strokeGrad1;

        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          // Map frequency index
          const dataIdx = Math.floor((i / numPoints) * (freqData.length * 0.6));
          const val = freqData[dataIdx] || 0;
          const amplitude = (val / 255) * 75; // More visual pop when Zoya talks sassy
          const noise = Math.cos(time / 50 + i * 2) * 2;
          const r = radius + amplitude + noise + 15;

          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();

        // Wave 2: Inner ghost wave
        ctx.shadowBlur = 5;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
        
        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          const dataIdx = Math.floor(((numPoints - i) / numPoints) * (freqData.length * 0.4));
          const val = freqData[dataIdx] || 0;
          const amplitude = (val / 255) * 45;
          const r = radius + amplitude - 8;

          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    animationFrameRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state, audioStreamer]);

  return (
    <div className="relative w-full max-w-[320px] h-[320px] mx-auto flex items-center justify-center">
      {/* Outer Pulse Shell */}
      {state !== 'disconnected' && (
        <div
          className={`absolute w-[240px] h-[240px] rounded-full border opacity-15 animate-ping duration-1000 ${
            state === 'speaking'
              ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.3)]'
              : state === 'listening'
              ? 'border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
              : 'border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.3)]'
          }`}
        />
      )}

      {/* Main Canvas Drawing Layer */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
};

import React, { useEffect, useRef } from 'react';
import type { SessionState, VoiceEmotionState } from '../types/live';
import { AudioStreamer } from '../services/AudioStreamer';

interface WaveformProps {
  state: SessionState;
  audioStreamer: AudioStreamer | null;
  theme?: 'neon-quantum' | 'cosmic-nebula' | 'retro-equalizer' | 'stellar-orbit' | 'liquid-aura';
  emotionState?: VoiceEmotionState | null;
}

export const Waveform: React.FC<WaveformProps> = ({ state, audioStreamer, theme = 'neon-quantum', emotionState }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarRef = useRef<HTMLDivElement | null>(null);
  const mouthContainerRef = useRef<HTMLDivElement | null>(null);
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

    // Cosmic Nebula & Stellar Orbit particle states
    const particles: Array<{
      angle: number;
      speed: number;
      orbitRadius: number;
      size: number;
      alpha: number;
      color: string;
    }> = [];
    for (let i = 0; i < 45; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.004 + Math.random() * 0.008,
        orbitRadius: 58 + Math.random() * 38,
        size: 1.2 + Math.random() * 2.5,
        alpha: 0.25 + Math.random() * 0.65,
        color: Math.random() > 0.6 ? '168, 85, 247' : Math.random() > 0.3 ? '236, 72, 153' : '6, 182, 212' // Purple, Pink or Cyan
      });
    }

    const orbitSpeeds = [0.005, -0.007, 0.004];
    const orbitAngles = [0, 0, 0];

    const draw = () => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Calculate volume for avatar scaling
      let volume = 0;
      if (state === 'speaking' && audioStreamer) {
        const freqData = audioStreamer.getOutputFrequencyData();
        if (freqData.length > 0) {
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) {
            sum += freqData[i];
          }
          volume = sum / freqData.length;
        }
      } else if (state === 'listening' && audioStreamer) {
        const freqData = audioStreamer.getInputFrequencyData();
        if (freqData.length > 0) {
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) {
            sum += freqData[i];
          }
          volume = sum / freqData.length;
        }
      }

      // Apply scale animation to the avatar element based on volume
      if (avatarRef.current) {
        const scale = 1.0 + (volume / 255) * 0.18;
        avatarRef.current.style.transform = `scale(${scale})`;
        
        const emo = emotionState?.emotion || 'calm';
        let glowRgb = '6, 182, 212'; // default cyan

        if (state === 'speaking') {
          if (emo === 'sad') glowRgb = '129, 140, 248'; // comforting lavender
          else if (emo === 'excited') glowRgb = '245, 158, 11'; // energetic golden pink
          else if (emo === 'stressed') glowRgb = '168, 85, 247'; // composed purple
          else glowRgb = '236, 72, 153'; // sweet pink
          
          avatarRef.current.style.boxShadow = `0 0 ${20 + (volume / 255) * 35}px rgba(${glowRgb}, ${0.35 + (volume / 255) * 0.45})`;
          avatarRef.current.style.borderColor = `rgba(${glowRgb}, ${0.5 + (volume / 255) * 0.5})`;
        } else if (state === 'listening') {
          if (emo === 'excited') glowRgb = '245, 158, 11'; // amber/gold
          else if (emo === 'sad') glowRgb = '56, 189, 248'; // calming ocean blue
          else if (emo === 'stressed') glowRgb = '244, 63, 94'; // alert rose/red
          else if (emo === 'whisper') glowRgb = '168, 85, 247'; // violet
          else glowRgb = '6, 182, 212'; // cyan
          
          avatarRef.current.style.boxShadow = `0 0 ${20 + (volume / 255) * 35}px rgba(${glowRgb}, ${0.35 + (volume / 255) * 0.45})`;
          avatarRef.current.style.borderColor = `rgba(${glowRgb}, ${0.5 + (volume / 255) * 0.5})`;
        } else if (state === 'connecting') {
          const pulse = 1.0 + Math.sin(Date.now() / 150) * 0.03;
          avatarRef.current.style.transform = `scale(${pulse})`;
          avatarRef.current.style.boxShadow = '0 0 20px rgba(168, 85, 247, 0.3)';
          avatarRef.current.style.borderColor = 'rgba(168, 85, 247, 0.4)';
        } else {
          avatarRef.current.style.transform = 'scale(1)';
          avatarRef.current.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.5)';
          avatarRef.current.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        }
      }

      // Apply lip-sync vertical mouth stretching to the mouth overlay container
      if (mouthContainerRef.current) {
        if (state === 'speaking') {
          const speechThreshold = 8;
          if (volume > speechThreshold) {
            // Unhide the mouth overlay
            mouthContainerRef.current.style.opacity = '1';
            // Scale vertically (scaleY) between 0.35 (almost closed) and 1.6 (fully open) based on volume!
            const scaleY = 0.35 + (volume / 255) * 1.25;
            mouthContainerRef.current.style.transform = `scaleY(${scaleY})`;
          } else {
            // Instantly hide overlay when silent
            mouthContainerRef.current.style.opacity = '0';
            mouthContainerRef.current.style.transform = 'scaleY(0)';
          }
        } else {
          // Keep mouth closed when user is talking or disconnected
          mouthContainerRef.current.style.opacity = '0';
          mouthContainerRef.current.style.transform = 'scaleY(0)';
        }
      }

      // 1. Base breathing orb / background effect
      const baseRadius = 65;
      const time = Date.now();
      const pulseSpeed = state === 'speaking' ? 180 : state === 'listening' ? 250 : 400;
      const breathingPulse = Math.sin(time / pulseSpeed) * (state === 'disconnected' ? 4 : 8);
      const radius = baseRadius + breathingPulse;

      const relativeVolume = volume / 255;

      // Theme-specific background renders
      if (theme === 'cosmic-nebula') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        const blobColors = [
          'rgba(168, 85, 247, 0.15)', // Purple
          'rgba(236, 72, 153, 0.12)', // Pink
          'rgba(6, 182, 212, 0.15)'   // Cyan
        ];
        
        blobColors.forEach((color, idx) => {
          const shiftAngle = (time / 1000) * (idx === 0 ? 0.6 : idx === 1 ? -0.4 : 0.9) + idx * Math.PI / 1.5;
          const shiftDistance = 12 + relativeVolume * 22;
          const bx = centerX + Math.cos(shiftAngle) * shiftDistance;
          const by = centerY + Math.sin(shiftAngle) * shiftDistance;
          const bRadius = (radius + 20 + idx * 8) * (1 + relativeVolume * 0.12);
          
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, bRadius);
          g.addColorStop(0, color);
          g.addColorStop(0.5, color.replace('0.1', '0.04'));
          g.addColorStop(1, 'rgba(0,0,0,0)');
          
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx, by, bRadius, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      } else if (theme === 'liquid-aura') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        const drawBlob = (color: string, scale: number, speedMultiplier: number, phase: number, numPoints = 8) => {
          ctx.beginPath();
          const points: Array<{x: number; y: number}> = [];
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const offset = Math.sin(time / (200 * speedMultiplier) + i * 1.5 + phase) * (12 + relativeVolume * 45);
            const r = (radius + offset) * scale;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            points.push({ x, y });
          }
          
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 0; i < numPoints; i++) {
            const p0 = points[i];
            const p1 = points[(i + 1) % numPoints];
            const xc = (p0.x + p1.x) / 2;
            const yc = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(p0.x, p0.y, xc, yc);
          }
          ctx.closePath();
          
          const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * scale * 1.25);
          grad.addColorStop(0, color);
          grad.addColorStop(0.6, color.replace('0.3', '0.06'));
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          
          ctx.fillStyle = grad;
          ctx.fill();
        };

        drawBlob('rgba(6, 182, 212, 0.28)', 1.2, 1.2, 0); // Cyan
        drawBlob('rgba(236, 72, 153, 0.24)', 1.0, 0.8, Math.PI / 3); // Pink
        drawBlob('rgba(168, 85, 247, 0.28)', 1.1, 1.5, Math.PI / 1.5); // Purple
        
        ctx.restore();
      } else {
        // Default standard radial glow behind the orb
        const emo = emotionState?.emotion || 'calm';
        let glowRgb = '6, 182, 212';
        let secondaryRgb = '99, 102, 241';

        if (state === 'speaking') {
          if (emo === 'sad') {
            glowRgb = '129, 140, 248'; // Lavender
            secondaryRgb = '168, 85, 247';
          } else if (emo === 'excited') {
            glowRgb = '245, 158, 11'; // Amber
            secondaryRgb = '236, 72, 153';
          } else if (emo === 'stressed') {
            glowRgb = '168, 85, 247'; // Purple
            secondaryRgb = '59, 130, 246';
          } else {
            glowRgb = '236, 72, 153'; // Pink
            secondaryRgb = '168, 85, 247';
          }
        } else if (state === 'listening') {
          if (emo === 'excited') {
            glowRgb = '245, 158, 11'; // Amber
            secondaryRgb = '236, 72, 153';
          } else if (emo === 'sad') {
            glowRgb = '56, 189, 248'; // Ocean blue
            secondaryRgb = '99, 102, 241';
          } else if (emo === 'stressed') {
            glowRgb = '244, 63, 94'; // Rose
            secondaryRgb = '239, 68, 68';
          } else if (emo === 'whisper') {
            glowRgb = '168, 85, 247'; // Violet
            secondaryRgb = '147, 51, 234';
          } else {
            glowRgb = '6, 182, 212'; // Cyan
            secondaryRgb = '16, 185, 129';
          }
        } else if (state === 'connecting') {
          glowRgb = '168, 85, 247';
          secondaryRgb = '236, 72, 153';
        } else {
          glowRgb = '99, 102, 241';
          secondaryRgb = '79, 70, 229';
        }

        ctx.save();
        ctx.shadowColor = `rgba(${glowRgb}, 0.6)`;
        ctx.shadowBlur = state === 'disconnected' ? 25 : 45;

        const radialGrad = ctx.createRadialGradient(
          centerX,
          centerY,
          0,
          centerX,
          centerY,
          radius
        );

        radialGrad.addColorStop(0, `rgba(${glowRgb}, 0.75)`);
        radialGrad.addColorStop(0.5, `rgba(${secondaryRgb}, 0.25)`);
        radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = radialGrad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 2. State-Specific Visualizations
      if (theme === 'cosmic-nebula') {
        ctx.save();
        const activeMultiplier = state === 'speaking' ? 2.5 : state === 'listening' ? 1.8 : state === 'connecting' ? 4.0 : 0.6;
        const volumeForce = relativeVolume * 45;
        
        particles.forEach((p) => {
          p.angle += p.speed * activeMultiplier;
          
          const currentRadius = p.orbitRadius + (state !== 'disconnected' ? volumeForce * (1 + Math.sin(p.angle * 2) * 0.2) : 0);
          const px = centerX + Math.cos(p.angle) * currentRadius;
          const py = centerY + Math.sin(p.angle) * currentRadius;
          
          const currentSize = p.size * (1 + relativeVolume * 0.5);
          
          ctx.beginPath();
          ctx.arc(px, py, currentSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
          ctx.shadowBlur = state !== 'disconnected' ? 8 : 2;
          ctx.shadowColor = `rgba(${p.color}, 0.8)`;
          ctx.fill();
        });
        ctx.restore();
        
      } else if (theme === 'retro-equalizer') {
        ctx.save();
        if (state === 'disconnected') {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 8]);
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 15, 0, Math.PI * 2);
          ctx.stroke();
        } else if (state === 'connecting') {
          rotationAngle += 0.05;
          ctx.strokeStyle = 'rgba(236, 72, 153, 0.7)';
          ctx.lineWidth = 3.5;
          ctx.shadowBlur = 10;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 18, rotationAngle, rotationAngle + Math.PI / 2);
          ctx.stroke();
          
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 18, rotationAngle + Math.PI, rotationAngle + 1.5 * Math.PI);
          ctx.stroke();
        } else if (audioStreamer) {
          const freqData = state === 'speaking' ? audioStreamer.getOutputFrequencyData() : audioStreamer.getInputFrequencyData();
          const numBars = 40;
          ctx.lineWidth = 3.5;
          ctx.lineCap = 'round';
          ctx.shadowBlur = 8;
          
          for (let i = 0; i < numBars; i++) {
            const angle = (i / numBars) * Math.PI * 2 + (time / 4000);
            const dataIdx = Math.floor((i / numBars) * (freqData.length * 0.5));
            const val = freqData[dataIdx] || 0;
            const barHeight = (val / 255) * 65 + (state === 'speaking' ? 4 : 2);
            
            const startR = radius + 12;
            const endR = startR + barHeight;
            
            const sx = centerX + Math.cos(angle) * startR;
            const sy = centerY + Math.sin(angle) * startR;
            const ex = centerX + Math.cos(angle) * endR;
            const ey = centerY + Math.sin(angle) * endR;
            
            const hue = state === 'speaking' ? 320 + (i * 3) : 190 + (i * 3);
            ctx.strokeStyle = `hsla(${hue}, 85%, 60%, 0.85)`;
            ctx.shadowColor = ctx.strokeStyle;
            
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
          }
        }
        ctx.restore();
        
      } else if (theme === 'stellar-orbit') {
        ctx.save();
        for (let rIdx = 0; rIdx < 3; rIdx++) {
          const baseOrbitR = radius + 16 + rIdx * 24;
          const activeMultiplier = state === 'speaking' ? 2.5 : state === 'listening' ? 1.8 : state === 'connecting' ? 4.0 : 0.6;
          orbitAngles[rIdx] += orbitSpeeds[rIdx] * activeMultiplier;
          
          ctx.beginPath();
          for (let i = 0; i <= 72; i++) {
            const angle = (i / 72) * Math.PI * 2;
            const waveOffset = state !== 'disconnected' ? Math.sin(angle * 6 + time / 120) * relativeVolume * 15 : 0;
            const oR = baseOrbitR + waveOffset;
            const x = centerX + Math.cos(angle) * oR;
            const y = centerY + Math.sin(angle) * oR;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          
          ctx.strokeStyle = rIdx === 0 
            ? 'rgba(168, 85, 247, 0.45)' 
            : rIdx === 1 
            ? 'rgba(236, 72, 153, 0.45)' 
            : 'rgba(6, 182, 212, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          
          for (let p = 0; p < 2; p++) {
            const pAngle = orbitAngles[rIdx] + (p * Math.PI);
            const waveOffset = state !== 'disconnected' ? Math.sin(pAngle * 6 + time / 120) * relativeVolume * 15 : 0;
            const oR = baseOrbitR + waveOffset;
            const px = centerX + Math.cos(pAngle) * oR;
            const py = centerY + Math.sin(pAngle) * oR;
            
            ctx.fillStyle = rIdx === 0 ? '#a855f7' : rIdx === 1 ? '#ec4899' : '#06b6d4';
            ctx.beginPath();
            ctx.arc(px, py, 3.2, 0, Math.PI * 2);
            ctx.shadowBlur = state !== 'disconnected' ? 8 : 3;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fill();
          }
        }
        ctx.restore();
        
      } else if (theme === 'liquid-aura') {
        if (state !== 'disconnected' && audioStreamer) {
          const freqData = state === 'speaking' ? audioStreamer.getOutputFrequencyData() : audioStreamer.getInputFrequencyData();
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 12;
          
          const drawContour = (color: string, sizeOffset: number, speed: number, waveFactor: number) => {
            ctx.strokeStyle = color;
            ctx.shadowColor = color;
            ctx.beginPath();
            const numPoints = 60;
            for (let i = 0; i < numPoints; i++) {
              const angle = (i / numPoints) * Math.PI * 2;
              const dataIdx = Math.floor((i / numPoints) * (freqData.length * 0.4));
              const val = freqData[dataIdx] || 0;
              const wave = Math.sin(angle * 5 + time / 150 * speed) * waveFactor;
              const amp = (val / 255) * 35;
              const r = radius + sizeOffset + amp + wave;
              const x = centerX + Math.cos(angle) * r;
              const y = centerY + Math.sin(angle) * r;
              
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
          };
          
          drawContour('rgba(6, 182, 212, 0.7)', 12, 1.0, 4);
          drawContour('rgba(236, 72, 153, 0.6)', 8, -0.8, 6);
          ctx.restore();
        } else if (state === 'connecting') {
          ctx.save();
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        
      } else {
        // Standard Classic Visualizer
        if (state === 'disconnected') {
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
          rotationAngle += 0.04;
          ctx.save();
          ctx.shadowColor = 'rgba(168, 85, 247, 0.8)';
          ctx.shadowBlur = 15;
          ctx.lineWidth = 3;

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
          const freqData = audioStreamer.getInputFrequencyData();
          const numPoints = 90;
          ctx.save();
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(6, 182, 212, 0.8)';
          ctx.lineWidth = 2.5;

          const strokeGrad = ctx.createLinearGradient(0, 0, width, height);
          strokeGrad.addColorStop(0, '#06b6d4');
          strokeGrad.addColorStop(1, '#a855f7');
          ctx.strokeStyle = strokeGrad;

          ctx.beginPath();
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const dataIdx = Math.floor((i / numPoints) * (freqData.length * 0.7));
            const val = freqData[dataIdx] || 0;
            const amplitude = (val / 255) * 45;
            
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
          const freqData = audioStreamer.getOutputFrequencyData();
          const numPoints = 120;
          ctx.save();

          ctx.shadowBlur = 20;
          ctx.shadowColor = 'rgba(236, 72, 153, 0.9)';
          ctx.lineWidth = 3;
          
          const strokeGrad1 = ctx.createLinearGradient(0, 0, width, height);
          strokeGrad1.addColorStop(0, '#ec4899');
          strokeGrad1.addColorStop(0.5, '#ef4444');
          strokeGrad1.addColorStop(1, '#a855f7');
          ctx.strokeStyle = strokeGrad1;

          ctx.beginPath();
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const dataIdx = Math.floor((i / numPoints) * (freqData.length * 0.6));
            const val = freqData[dataIdx] || 0;
            const amplitude = (val / 255) * 75;
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
  }, [state, audioStreamer, theme, emotionState]);

  return (
    <div className="relative w-full max-w-[200px] h-[200px] mx-auto flex items-center justify-center">
      {/* Dynamic Avatar Container in the Center */}
      <div
        ref={avatarRef}
        className="absolute w-[112px] h-[112px] rounded-full border overflow-hidden bg-neutral-900 shadow-2xl transition-all duration-75 flex items-center justify-center z-0"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Closed mouth (base layer) */}
        <img
          src="/zoya.png"
          alt="Zoya Avatar"
          className="absolute w-full h-full object-cover"
        />
        {/* Open mouth overlay (clipped only to the mouth region, scales vertically) */}
        <div
          ref={mouthContainerRef}
          className="absolute overflow-hidden pointer-events-none transition-all duration-75 opacity-0 z-10"
          style={{
            top: '53.5%',
            left: '38%',
            width: '24%',
            height: '8.5%',
            borderRadius: '50%',
            transformOrigin: 'center top',
          }}
        >
          <img
            src="/zoya_open.png"
            alt="Mouth Open"
            className="absolute object-cover"
            style={{
              top: '-629.4%',
              left: '-158.3%',
              width: '416.7%',
              height: '1176.5%',
              maxWidth: 'none',
            }}
          />
        </div>
      </div>

      {/* Real-time Voice Emotion Pill */}
      {state !== 'disconnected' && emotionState && (
        <div
          className={`absolute -bottom-3.5 z-30 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-neutral-950/90 border backdrop-blur-md shadow-xl transition-all duration-300 pointer-events-none select-none ${
            emotionState.emotion === 'excited'
              ? 'border-amber-400/50 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
              : emotionState.emotion === 'sad'
              ? 'border-sky-400/50 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
              : emotionState.emotion === 'stressed'
              ? 'border-rose-400/50 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.25)]'
              : emotionState.emotion === 'whisper'
              ? 'border-purple-400/50 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
              : 'border-cyan-400/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
          }`}
        >
          <span className="text-xs leading-none">{emotionState.emoji}</span>
          <span className="text-[9px] font-extrabold uppercase tracking-wider">{emotionState.label}</span>
          <span className="text-[8px] font-semibold opacity-70">({emotionState.confidence}%)</span>
        </div>
      )}

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
        className="w-full h-full block z-10"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
};

declare module 'mind-ar' {
  import type { Group, Scene, Camera, WebGLRenderer } from 'three';

  export interface MindARThreeAnchor {
    group: Group;
    onTargetFound: (() => void) | null;
    onTargetLost: (() => void) | null;
    onTargetUpdate: ((() => void) | null) | null;
    visible: boolean;
  }

  export interface MindARThreeOptions {
    container: HTMLElement;
    imageTargetSrc: string;
    maxTrack?: number;
    uiLoading?: 'yes' | 'no';
    uiScanning?: 'yes' | 'no';
    uiError?: 'yes' | 'no';
    filterMinCF?: number | null;
    filterBeta?: number | null;
    warmupTolerance?: number | null;
    missTolerance?: number | null;
    userDeviceId?: string | null;
    environmentDeviceId?: string | null;
  }

  export class MindARThree {
    public scene: Scene;
    public cssScene: Scene;
    public camera: Camera;
    public renderer: WebGLRenderer;
    public cssRenderer: WebGLRenderer;
    public anchors: MindARThreeAnchor[];

    constructor(options: MindARThreeOptions);

    public start(): Promise<void>;
    public stop(): Promise<void>;
    public addAnchor(targetIndex: number): MindARThreeAnchor;
    public addCSSAnchor(targetIndex: number): MindARThreeAnchor;
  }
}

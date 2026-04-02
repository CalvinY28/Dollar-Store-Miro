import { useEffect, useRef, useState } from "react";
import {
    Stage,
    Layer,
    Rect,
    Text,
    Image as KonvaImage,
    Transformer,
} from "react-konva";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import "./App.css";

const BOARD_WIDTH = 6000;
const BOARD_HEIGHT = 4000;
const SIDEBAR_WIDTH = 220;

type TextItem = {
    id: string;
    type: "text";
    x: number;
    y: number;
    text: string;
    fontSize: number;
    width: number;
};

type ImageItem = {
    id: string;
    type: "image";
    x: number;
    y: number;
    width: number;
    height: number;
    src: string;
};

type BoardItem = TextItem | ImageItem;

function ImageNode({
    item,
    selectedId,
    setSelectedId,
    shapeRefs,
    updateItemPosition,
}: {
    item: ImageItem;
    selectedId: string | null;
    setSelectedId: (id: string) => void;
    shapeRefs: React.MutableRefObject<Record<string, Konva.Text | Konva.Image | null>>;
    updateItemPosition: (id: string, x: number, y: number) => void;
}) {
    const [image, setImage] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        const img = new window.Image();
        img.src = item.src;
        img.onload = () => setImage(img);
    }, [item.src]);

    return (
        <KonvaImage
            ref={(node) => {
                shapeRefs.current[item.id] = node;
            }}
            image={image}
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            draggable
            onMouseDown={() => setSelectedId(item.id)}
            onClick={() => setSelectedId(item.id)}
            onDragEnd={(e: KonvaEventObject<DragEvent>) => {
                updateItemPosition(item.id, e.target.x(), e.target.y());
            }}
        />
    );
}

export default function App() {
    const stageRef = useRef<Konva.Stage | null>(null);
    const trRef = useRef<Konva.Transformer | null>(null);
    const shapeRefs = useRef<Record<string, Konva.Text | Konva.Image | null>>({});

    const [scale, setScale] = useState(0.25);
    const [pos, setPos] = useState({ x: 260, y: 80 });
    const [items, setItems] = useState<BoardItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 });

    const selectedItem = items.find((item) => item.id === selectedId) ?? null;

    useEffect(() => {
        if (!trRef.current) return;

        if (!selectedId) {
            trRef.current.nodes([]);
            trRef.current.getLayer()?.batchDraw();
            return;
        }

        const node = shapeRefs.current[selectedId];
        if (!node) return;

        trRef.current.nodes([node]);
        trRef.current.getLayer()?.batchDraw();
    }, [selectedId, items]);

    const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();

        const stage = e.target.getStage();
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const oldScale = scale;
        const scaleBy = 1.05;

        const mousePointTo = {
            x: (pointer.x - pos.x) / oldScale,
            y: (pointer.y - pos.y) / oldScale,
        };

        const direction = e.evt.deltaY > 0 ? -1 : 1;
        const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
        const clampedScale = Math.max(0.1, Math.min(4, newScale));

        const newPos = {
            x: pointer.x - mousePointTo.x * clampedScale,
            y: pointer.y - mousePointTo.y * clampedScale,
        };

        setScale(clampedScale);
        setPos(newPos);
    };

    const addText = () => {
        const newText: TextItem = {
            id: crypto.randomUUID(),
            type: "text",
            x: 300,
            y: 200,
            text: "Double-click to edit",
            fontSize: 32,
            width: 320,
        };

        setItems((prev) => [...prev, newText]);
        setSelectedId(newText.id);
    };

    const addImageFromFile = (file: File) => {
        const reader = new FileReader();

        reader.onload = () => {
            const src = String(reader.result);
            const img = new window.Image();
            img.src = src;

            img.onload = () => {
                const maxWidth = 500;
                const imageScale = img.width > maxWidth ? maxWidth / img.width : 1;

                const newImage: ImageItem = {
                    id: crypto.randomUUID(),
                    type: "image",
                    x: 300,
                    y: 300,
                    width: img.width * imageScale,
                    height: img.height * imageScale,
                    src,
                };

                setItems((prev) => [...prev, newImage]);
                setSelectedId(newImage.id);
            };
        };

        reader.readAsDataURL(file);
    };

    const editText = (id: string) => {
        const item = items.find((i) => i.id === id && i.type === "text");
        if (!item || item.type !== "text") return;

        const next = window.prompt("Edit text", item.text);
        if (next === null) return;

        setItems((prev) =>
            prev.map((i) =>
                i.id === id && i.type === "text" ? { ...i, text: next } : i
            )
        );
    };

    const updateItemPosition = (id: string, x: number, y: number) => {
        setItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, x, y } : item))
        );
    };

    const applyTransform = () => {
        if (!selectedId) return;

        const node = shapeRefs.current[selectedId];
        const item = items.find((i) => i.id === selectedId);

        if (!node || !item) return;

        if (item.type === "image") {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();

            node.scaleX(1);
            node.scaleY(1);

            setItems((prev) =>
                prev.map((i) =>
                    i.id === selectedId && i.type === "image"
                        ? {
                            ...i,
                            x: node.x(),
                            y: node.y(),
                            width: Math.max(20, node.width() * scaleX),
                            height: Math.max(20, node.height() * scaleY),
                        }
                        : i
                )
            );
        }

        if (item.type === "text") {
            const scaleX = node.scaleX();

            node.scaleX(1);
            node.scaleY(1);

            setItems((prev) =>
                prev.map((i) =>
                    i.id === selectedId && i.type === "text"
                        ? {
                            ...i,
                            x: node.x(),
                            y: node.y(),
                            width: Math.max(80, node.width() * scaleX),
                            fontSize: Math.max(8, i.fontSize * scaleX),
                        }
                        : i
                )
            );
        }
    };

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const pastedItems = e.clipboardData?.items;
            if (!pastedItems) return;

            for (const item of Array.from(pastedItems)) {
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) addImageFromFile(file);
                }
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
                setItems((prev) => prev.filter((item) => item.id !== selectedId));
                setSelectedId(null);
            }
        };

        window.addEventListener("paste", handlePaste);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("paste", handlePaste);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [selectedId]);

    const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
        const clickedOnStage = e.target === e.target.getStage();
        const clickedOnBoardBackground = e.target.name() === "board-background";

        if (clickedOnStage || clickedOnBoardBackground) {
            setSelectedId(null);
        }

        if (e.evt.button === 1) {
            e.evt.preventDefault();
            setIsPanning(true);
            setLastPointer({
                x: e.evt.clientX,
                y: e.evt.clientY,
            });
        }
    };

    const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
        if (!isPanning) return;

        const currentX = e.evt.clientX;
        const currentY = e.evt.clientY;

        setPos((prev) => ({
            x: prev.x + (currentX - lastPointer.x),
            y: prev.y + (currentY - lastPointer.y),
        }));

        setLastPointer({
            x: currentX,
            y: currentY,
        });
    };

    const stopPanning = () => {
        setIsPanning(false);
    };

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                display: "flex",
                background: "#d9d9d9",
            }}
            onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
            }}
        >
            <div
                style={{
                    width: "220px",
                    height: "100%",
                    background: "#f3f3f3",
                    borderRight: "1px solid #c8c8c8",
                    padding: "16px",
                    boxSizing: "border-box",
                }}
            >
                <h2 style={{ marginTop: 0, fontSize: "20px" }}>Board App</h2>

                <button
                    onClick={addText}
                    style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        cursor: "pointer",
                        marginBottom: "12px",
                    }}
                >
                    Add Text
                </button>

                <label
                    style={{
                        display: "block",
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        cursor: "pointer",
                        marginBottom: "12px",
                        background: "#fff",
                        border: "1px solid #bbb",
                        textAlign: "center",
                        boxSizing: "border-box",
                    }}
                >
                    Add Image
                    <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                addImageFromFile(file);
                                e.target.value = "";
                            }
                        }}
                    />
                </label>

                <p style={{ fontSize: "14px", lineHeight: 1.4 }}>
                    Left click item body to select/move.
                    <br />
                    Drag resize handles to resize.
                    <br />
                    Middle click drag to pan.
                    <br />
                    Scroll to zoom.
                    <br />
                    Double-click text to edit.
                    <br />
                    Ctrl + V to paste images.
                    <br />
                    Delete removes selected item.
                </p>
            </div>

            <div style={{ flex: 1, height: "100%" }}>
                <Stage
                    ref={stageRef}
                    width={window.innerWidth - SIDEBAR_WIDTH}
                    height={window.innerHeight}
                    x={pos.x}
                    y={pos.y}
                    scaleX={scale}
                    scaleY={scale}
                    onMouseDown={handleStageMouseDown}
                    onMouseMove={handleStageMouseMove}
                    onMouseUp={stopPanning}
                    onMouseLeave={stopPanning}
                    onWheel={handleWheel}
                >
                    <Layer>
                        <Rect
                            name="board-background"
                            x={0}
                            y={0}
                            width={BOARD_WIDTH}
                            height={BOARD_HEIGHT}
                            fill="white"
                            stroke="#999"
                            strokeWidth={2}
                        />

                        {items.map((item) => {
                            if (item.type === "text") {
                                return (
                                    <Text
                                        key={item.id}
                                        ref={(node) => {
                                            shapeRefs.current[item.id] = node;
                                        }}
                                        x={item.x}
                                        y={item.y}
                                        text={item.text}
                                        fontSize={item.fontSize}
                                        width={item.width}
                                        fill="black"
                                        draggable
                                        onMouseDown={() => setSelectedId(item.id)}
                                        onClick={() => setSelectedId(item.id)}
                                        onDragEnd={(e: KonvaEventObject<DragEvent>) => {
                                            updateItemPosition(item.id, e.target.x(), e.target.y());
                                        }}
                                        onDblClick={() => editText(item.id)}
                                    />
                                );
                            }

                            return (
                                <ImageNode
                                    key={item.id}
                                    item={item}
                                    selectedId={selectedId}
                                    setSelectedId={setSelectedId}
                                    shapeRefs={shapeRefs}
                                    updateItemPosition={updateItemPosition}
                                />
                            );
                        })}

                        <Transformer
                            ref={trRef}
                            rotateEnabled={false}
                            keepRatio={false}
                            enabledAnchors={
                                selectedItem?.type === "text"
                                    ? ["middle-left", "middle-right"]
                                    : undefined
                            }
                            onTransformEnd={applyTransform}
                        />
                    </Layer>
                </Stage>
            </div>
        </div>
    );
}
import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage } from "react-konva";
import "./App.css";

const BOARD_WIDTH = 6000;
const BOARD_HEIGHT = 4000;
const SIDEBAR_WIDTH = 220;

type TextItem = {
    id: string;
    x: number;
    y: number;
    text: string;
    fontSize: number;
    width: number;
};

type ImageItem = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    src: string;
};

function BoardImage({
    item,
    onMove,
}: {
    item: ImageItem;
    onMove: (id: string, x: number, y: number) => void;
}) {
    const [image, setImage] = useState<HTMLImageElement | null>(null);

    useEffect(() => {
        const img = new window.Image();
        img.src = item.src;
        img.onload = () => setImage(img);
    }, [item.src]);

    return (
        <KonvaImage
            image={image}
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
            draggable
            onDragEnd={(e) => {
                onMove(item.id, e.target.x(), e.target.y());
            }}
        />
    );
}

export default function App() {
    const stageRef = useRef<any>(null);

    const [scale, setScale] = useState(0.25);
    const [pos, setPos] = useState({ x: 260, y: 80 });
    const [texts, setTexts] = useState<TextItem[]>([]);
    const [images, setImages] = useState<ImageItem[]>([]);
    const [isPanning, setIsPanning] = useState(false);
    const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 });

    const handleWheel = (e: any) => {
        e.evt.preventDefault();

        const scaleBy = 1.05;
        const stage = e.target.getStage();
        const oldScale = scale;
        const pointer = stage.getPointerPosition();

        if (!pointer) return;

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
            x: 300,
            y: 200,
            text: "Double-click to edit",
            fontSize: 32,
            width: 320,
        };

        setTexts((prev) => [...prev, newText]);
    };

    const updateTextPosition = (id: string, x: number, y: number) => {
        setTexts((prev) =>
            prev.map((item) => (item.id === id ? { ...item, x, y } : item))
        );
    };

    const editText = (id: string) => {
        const current = texts.find((t) => t.id === id);
        if (!current) return;

        const nextText = window.prompt("Edit text", current.text);
        if (nextText === null) return;

        setTexts((prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, text: nextText } : item
            )
        );
    };

    const updateImagePosition = (id: string, x: number, y: number) => {
        setImages((prev) =>
            prev.map((item) => (item.id === id ? { ...item, x, y } : item))
        );
    };

    const addImageFromFile = (file: File) => {
        const reader = new FileReader();

        reader.onload = () => {
            const src = String(reader.result);

            const img = new window.Image();
            img.src = src;

            img.onload = () => {
                const maxWidth = 500;
                const scale = img.width > maxWidth ? maxWidth / img.width : 1;

                const newImage: ImageItem = {
                    id: crypto.randomUUID(),
                    x: 300,
                    y: 300,
                    width: img.width * scale,
                    height: img.height * scale,
                    src,
                };

                setImages((prev) => [...prev, newImage]);
            };
        };

        reader.readAsDataURL(file);
    };

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of Array.from(items)) {
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                        addImageFromFile(file);
                    }
                }
            }
        };

        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
    }, []);

    const handleMouseDown = (e: any) => {
        if (e.evt.button === 1) {
            e.evt.preventDefault();
            setIsPanning(true);
            setLastPointer({
                x: e.evt.clientX,
                y: e.evt.clientY,
            });
        }
    };

    const handleMouseMove = (e: any) => {
        if (!isPanning) return;

        const currentX = e.evt.clientX;
        const currentY = e.evt.clientY;

        const dx = currentX - lastPointer.x;
        const dy = currentY - lastPointer.y;

        setPos((prev) => ({
            x: prev.x + dx,
            y: prev.y + dy,
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
                    Left click drag text/images to move.
                    <br />
                    Middle click drag to pan.
                    <br />
                    Scroll to zoom.
                    <br />
                    Double-click text to edit.
                    <br />
                    Ctrl + V to paste images.
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
                    draggable={false}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={stopPanning}
                    onMouseLeave={stopPanning}
                    onWheel={handleWheel}
                >
                    <Layer>
                        <Rect
                            x={0}
                            y={0}
                            width={BOARD_WIDTH}
                            height={BOARD_HEIGHT}
                            fill="white"
                            stroke="#999"
                            strokeWidth={2}
                        />

                        {images.map((item) => (
                            <BoardImage
                                key={item.id}
                                item={item}
                                onMove={updateImagePosition}
                            />
                        ))}

                        {texts.map((item) => (
                            <Text
                                key={item.id}
                                x={item.x}
                                y={item.y}
                                text={item.text}
                                fontSize={item.fontSize}
                                width={item.width}
                                fill="black"
                                draggable
                                onDragEnd={(e) => {
                                    updateTextPosition(item.id, e.target.x(), e.target.y());
                                }}
                                onDblClick={() => editText(item.id)}
                            />
                        ))}
                    </Layer>
                </Stage>
            </div>
        </div>
    );
}
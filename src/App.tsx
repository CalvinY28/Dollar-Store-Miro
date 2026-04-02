import { useRef, useState } from "react";
import { Stage, Layer, Rect, Text } from "react-konva";
import "./App.css";

const BOARD_WIDTH = 6000;
const BOARD_HEIGHT = 4000;

type TextItem = {
    id: string;
    x: number;
    y: number;
    text: string;
    fontSize: number;
    width: number;
};

export default function App() {
    const stageRef = useRef<any>(null);

    const [scale, setScale] = useState(0.25);
    const [pos, setPos] = useState({ x: 260, y: 80 });
    const [texts, setTexts] = useState<TextItem[]>([]);

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

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                display: "flex",
                background: "#d9d9d9",
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

                <p style={{ fontSize: "14px", lineHeight: 1.4 }}>
                    Drag the canvas to pan.
                    <br />
                    Scroll to zoom.
                    <br />
                    Double-click text to edit.
                </p>
            </div>

            <div style={{ flex: 1, height: "100%" }}>
                <Stage
                    ref={stageRef}
                    width={window.innerWidth - 220}
                    height={window.innerHeight}
                    x={pos.x}
                    y={pos.y}
                    scaleX={scale}
                    scaleY={scale}
                    draggable
                    onDragEnd={(e) => {
                        setPos({
                            x: e.target.x(),
                            y: e.target.y(),
                        });
                    }}
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
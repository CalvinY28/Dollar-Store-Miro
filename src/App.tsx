import { useRef, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";
import "./App.css";

const BOARD_WIDTH = 6000;
const BOARD_HEIGHT = 4000;

export default function App() {
    const stageRef = useRef<any>(null);

    const [scale, setScale] = useState(0.25);
    const [pos, setPos] = useState({ x: 100, y: 80 });

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

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                background: "#d6d6d6",
            }}
        >
            <Stage
                ref={stageRef}
                width={window.innerWidth}
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
                </Layer>
            </Stage>
        </div>
    );
}
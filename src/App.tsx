import { useEffect, useMemo, useRef, useState } from "react";
import {
    Stage,
    Layer,
    Rect,
    Text,
    Image as KonvaImage,
    Transformer,
} from "react-konva";
import { jsPDF } from "jspdf";
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

type Board = {
    id: string;
    name: string;
    items: BoardItem[];
    scale: number;
    pos: {
        x: number;
        y: number;
    };
};

function createDefaultBoard(name = "Board 1"): Board {
    return {
        id: crypto.randomUUID(),
        name,
        items: [],
        scale: 0.25,
        pos: { x: 260, y: 80 },
    };
}

function ImageNode({
    item,
    setSelectedId,
    shapeRefs,
    updateItemPosition,
}: {
    item: ImageItem;
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
    const appRef = useRef<HTMLDivElement | null>(null);
    const stageRef = useRef<Konva.Stage | null>(null);
    const trRef = useRef<Konva.Transformer | null>(null);
    const shapeRefs = useRef<Record<string, Konva.Text | Konva.Image | null>>({});
    const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
    const boardRenameRef = useRef<HTMLInputElement | null>(null);

    const [boards, setBoards] = useState<Board[]>(() => {
        const saved = localStorage.getItem("board-app-boards");
        if (!saved) return [createDefaultBoard()];

        try {
            const parsed = JSON.parse(saved) as Board[];
            return parsed.length > 0 ? parsed : [createDefaultBoard()];
        } catch {
            return [createDefaultBoard()];
        }
    });

    const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 });

    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [editingTextValue, setEditingTextValue] = useState("");
    const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
    const [renamingBoardValue, setRenamingBoardValue] = useState("");

    useEffect(() => {
        if (!activeBoardId && boards.length > 0) {
            setActiveBoardId(boards[0].id);
        }
    }, [activeBoardId, boards]);

    useEffect(() => {
        localStorage.setItem("board-app-boards", JSON.stringify(boards));
    }, [boards]);

    const activeBoard = boards.find((board) => board.id === activeBoardId) ?? null;
    const scale = activeBoard?.scale ?? 0.25;
    const pos = activeBoard?.pos ?? { x: 260, y: 80 };
    const items = activeBoard?.items ?? [];
    const selectedItem = items.find((item) => item.id === selectedId) ?? null;

    const editingTextItem = useMemo(() => {
        if (!editingTextId) return null;
        const item = items.find((i) => i.id === editingTextId && i.type === "text");
        return item && item.type === "text" ? item : null;
    }, [editingTextId, items]);

    const updateActiveBoard = (updater: (board: Board) => Board) => {
        if (!activeBoardId) return;

        setBoards((prev) =>
            prev.map((board) =>
                board.id === activeBoardId ? updater(board) : board
            )
        );
    };

    useEffect(() => {
        shapeRefs.current = {};
    }, [activeBoardId]);

    useEffect(() => {
        if (!trRef.current) return;

        if (!selectedId || editingTextId === selectedId) {
            trRef.current.nodes([]);
            trRef.current.getLayer()?.batchDraw();
            return;
        }

        const node = shapeRefs.current[selectedId];
        if (!node) return;

        trRef.current.nodes([node]);
        trRef.current.getLayer()?.batchDraw();
    }, [selectedId, items, activeBoardId, editingTextId]);

    useEffect(() => {
        if (editingTextId && textEditorRef.current) {
            textEditorRef.current.focus();
            textEditorRef.current.select();
        }
    }, [editingTextId]);

    useEffect(() => {
        if (renamingBoardId && boardRenameRef.current) {
            boardRenameRef.current.focus();
            boardRenameRef.current.select();
        }
    }, [renamingBoardId]);

    const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();

        const stage = e.target.getStage();
        if (!stage || !activeBoard || editingTextId) return;

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

        updateActiveBoard((board) => ({
            ...board,
            scale: clampedScale,
            pos: newPos,
        }));
    };

    const addBoard = () => {
        const newBoard = createDefaultBoard(`Board ${boards.length + 1}`);
        setBoards((prev) => [...prev, newBoard]);
        setActiveBoardId(newBoard.id);
        setSelectedId(null);
        setEditingTextId(null);
    };

    const startRenamingBoard = (board: Board) => {
        setRenamingBoardId(board.id);
        setRenamingBoardValue(board.name);
    };

    const saveBoardRename = () => {
        if (!renamingBoardId) return;

        const trimmed = renamingBoardValue.trim();

        if (!trimmed) {
            setRenamingBoardId(null);
            setRenamingBoardValue("");
            return;
        }

        setBoards((prev) =>
            prev.map((board) =>
                board.id === renamingBoardId ? { ...board, name: trimmed } : board
            )
        );

        setRenamingBoardId(null);
        setRenamingBoardValue("");
    };

    const cancelBoardRename = () => {
        setRenamingBoardId(null);
        setRenamingBoardValue("");
    };

    const deleteActiveBoard = () => {
        if (!activeBoard) return;
        if (boards.length <= 1) {
            window.alert("You need to keep at least one board.");
            return;
        }

        const confirmed = window.confirm(`Delete "${activeBoard.name}"?`);
        if (!confirmed) return;

        const currentIndex = boards.findIndex((board) => board.id === activeBoard.id);
        const remainingBoards = boards.filter((board) => board.id !== activeBoard.id);

        setBoards(remainingBoards);

        const nextBoard =
            remainingBoards[currentIndex] ??
            remainingBoards[currentIndex - 1] ??
            remainingBoards[0] ??
            null;

        setActiveBoardId(nextBoard ? nextBoard.id : null);
        setSelectedId(null);
        setEditingTextId(null);
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

        updateActiveBoard((board) => ({
            ...board,
            items: [...board.items, newText],
        }));
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

                updateActiveBoard((board) => ({
                    ...board,
                    items: [...board.items, newImage],
                }));
                setSelectedId(newImage.id);
            };
        };

        reader.readAsDataURL(file);
    };

    const startEditingText = (id: string) => {
        const item = items.find((i) => i.id === id && i.type === "text");
        if (!item || item.type !== "text") return;

        setSelectedId(id);
        setEditingTextId(id);
        setEditingTextValue(item.text);
    };

    const saveTextEdit = () => {
        if (!editingTextId) return;

        updateActiveBoard((board) => ({
            ...board,
            items: board.items.map((i) =>
                i.id === editingTextId && i.type === "text"
                    ? { ...i, text: editingTextValue }
                    : i
            ),
        }));

        setEditingTextId(null);
    };

    const cancelTextEdit = () => {
        setEditingTextId(null);
    };

    const updateItemPosition = (id: string, x: number, y: number) => {
        updateActiveBoard((board) => ({
            ...board,
            items: board.items.map((item) =>
                item.id === id ? { ...item, x, y } : item
            ),
        }));
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

            updateActiveBoard((board) => ({
                ...board,
                items: board.items.map((i) =>
                    i.id === selectedId && i.type === "image"
                        ? {
                            ...i,
                            x: node.x(),
                            y: node.y(),
                            width: Math.max(20, node.width() * scaleX),
                            height: Math.max(20, node.height() * scaleY),
                        }
                        : i
                ),
            }));
        }

        if (item.type === "text") {
            const scaleX = node.scaleX();

            node.scaleX(1);
            node.scaleY(1);

            updateActiveBoard((board) => ({
                ...board,
                items: board.items.map((i) =>
                    i.id === selectedId && i.type === "text"
                        ? {
                            ...i,
                            x: node.x(),
                            y: node.y(),
                            width: Math.max(80, node.width() * scaleX),
                            fontSize: Math.max(8, i.fontSize * scaleX),
                        }
                        : i
                ),
            }));
        }
    };

    const exportBoardAsPDF = () => {
        const stage = stageRef.current;
        if (!stage || !activeBoard) return;

        const previousScaleX = stage.scaleX();
        const previousScaleY = stage.scaleY();
        const previousX = stage.x();
        const previousY = stage.y();

        stage.scale({ x: 1, y: 1 });
        stage.position({ x: 0, y: 0 });
        stage.batchDraw();

        const dataURL = stage.toDataURL({
            x: 0,
            y: 0,
            width: BOARD_WIDTH,
            height: BOARD_HEIGHT,
            pixelRatio: 2,
        });

        stage.scale({ x: previousScaleX, y: previousScaleY });
        stage.position({ x: previousX, y: previousY });
        stage.batchDraw();

        const pdf = new jsPDF({
            orientation: BOARD_WIDTH > BOARD_HEIGHT ? "landscape" : "portrait",
            unit: "px",
            format: [BOARD_WIDTH, BOARD_HEIGHT],
        });

        pdf.addImage(dataURL, "PNG", 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
        pdf.save(`${activeBoard.name}.pdf`);
    };

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const pastedItems = e.clipboardData?.items;
            if (!pastedItems || !activeBoardId) return;

            for (const item of Array.from(pastedItems)) {
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) addImageFromFile(file);
                }
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (editingTextId) return;

            if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
                updateActiveBoard((board) => ({
                    ...board,
                    items: board.items.filter((item) => item.id !== selectedId),
                }));
                setSelectedId(null);
            }
        };

        window.addEventListener("paste", handlePaste);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("paste", handlePaste);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [selectedId, activeBoardId, editingTextId]);

    const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
        if (editingTextId) return;

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
        if (!isPanning || !activeBoard || editingTextId) return;

        const currentX = e.evt.clientX;
        const currentY = e.evt.clientY;

        updateActiveBoard((board) => ({
            ...board,
            pos: {
                x: board.pos.x + (currentX - lastPointer.x),
                y: board.pos.y + (currentY - lastPointer.y),
            },
        }));

        setLastPointer({
            x: currentX,
            y: currentY,
        });
    };

    const stopPanning = () => {
        setIsPanning(false);
    };

    const textEditorStyle = useMemo(() => {
        if (!editingTextItem) return null;

        const left = SIDEBAR_WIDTH + pos.x + editingTextItem.x * scale;
        const top = pos.y + editingTextItem.y * scale;

        return {
            position: "absolute" as const,
            left: `${left}px`,
            top: `${top}px`,
            width: `${Math.max(80, editingTextItem.width * scale)}px`,
            minHeight: `${Math.max(24, editingTextItem.fontSize * scale * 1.3)}px`,
            fontSize: `${editingTextItem.fontSize * scale}px`,
            lineHeight: "1.2",
            fontFamily: "Arial, sans-serif",
            color: "#000",
            background: "#fff",
            border: "1px solid #3b82f6",
            padding: "0",
            margin: "0",
            outline: "none",
            resize: "none" as const,
            overflow: "hidden" as const,
            whiteSpace: "pre-wrap" as const,
            boxSizing: "border-box" as const,
            zIndex: 20,
        };
    }, [editingTextItem, pos, scale]);

    return (
        <div
            ref={appRef}
            style={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                display: "flex",
                background: "#d9d9d9",
                position: "relative",
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
                    overflowY: "auto",
                }}
            >
                <h2 style={{ marginTop: 0, fontSize: "20px" }}>Board App</h2>

                <button
                    onClick={addBoard}
                    style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        cursor: "pointer",
                        marginBottom: "12px",
                    }}
                >
                    Add Board
                </button>

                <button
                    onClick={deleteActiveBoard}
                    style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        cursor: boards.length > 1 ? "pointer" : "not-allowed",
                        marginBottom: "12px",
                        opacity: boards.length > 1 ? 1 : 0.6,
                    }}
                    disabled={!activeBoard || boards.length <= 1}
                >
                    Delete Board
                </button>

                <button
                    onClick={addText}
                    style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        cursor: "pointer",
                        marginBottom: "12px",
                    }}
                    disabled={!activeBoard}
                >
                    Add Text
                </button>

                <label
                    style={{
                        display: "block",
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        cursor: activeBoard ? "pointer" : "not-allowed",
                        marginBottom: "12px",
                        background: "#fff",
                        border: "1px solid #bbb",
                        textAlign: "center",
                        boxSizing: "border-box",
                        opacity: activeBoard ? 1 : 0.6,
                    }}
                >
                    Add Image
                    <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        disabled={!activeBoard}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                addImageFromFile(file);
                                e.target.value = "";
                            }
                        }}
                    />
                </label>

                <button
                    onClick={exportBoardAsPDF}
                    style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: "16px",
                        cursor: "pointer",
                        marginBottom: "12px",
                    }}
                    disabled={!activeBoard}
                >
                    Export PDF
                </button>

                <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontWeight: "bold", marginBottom: "8px" }}>Boards</div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {boards.map((board) => {
                            const isRenaming = renamingBoardId === board.id;

                            if (isRenaming) {
                                return (
                                    <input
                                        key={board.id}
                                        ref={boardRenameRef}
                                        value={renamingBoardValue}
                                        onChange={(e) => setRenamingBoardValue(e.target.value)}
                                        onBlur={saveBoardRename}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                saveBoardRename();
                                            }
                                            if (e.key === "Escape") {
                                                e.preventDefault();
                                                cancelBoardRename();
                                            }
                                        }}
                                        style={{
                                            width: "100%",
                                            padding: "10px",
                                            border: "1px solid #3b82f6",
                                            boxSizing: "border-box",
                                            fontSize: "14px",
                                        }}
                                    />
                                );
                            }

                            return (
                                <button
                                    key={board.id}
                                    onClick={() => {
                                        setActiveBoardId(board.id);
                                        setSelectedId(null);
                                        setEditingTextId(null);
                                    }}
                                    onDoubleClick={() => startRenamingBoard(board)}
                                    style={{
                                        width: "100%",
                                        padding: "10px",
                                        textAlign: "left",
                                        cursor: "pointer",
                                        border: "1px solid #bbb",
                                        background: board.id === activeBoardId ? "#dbeafe" : "#fff",
                                    }}
                                    title="Double-click to rename"
                                >
                                    {board.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <p style={{ fontSize: "14px", lineHeight: 1.4 }}>
                    Double-click text to edit inline.
                    <br />
                    Double-click board names to rename.
                    <br />
                    Left click item body to select/move.
                    <br />
                    Drag resize handles to resize.
                    <br />
                    Middle click drag to pan.
                    <br />
                    Scroll to zoom.
                    <br />
                    Ctrl + V to paste images.
                    <br />
                    Delete removes selected item.
                    <br />
                    Boards save automatically.
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
                                const isEditing = editingTextId === item.id;

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
                                        visible={!isEditing}
                                        draggable={!isEditing}
                                        onMouseDown={() => setSelectedId(item.id)}
                                        onClick={() => setSelectedId(item.id)}
                                        onDragEnd={(e: KonvaEventObject<DragEvent>) => {
                                            updateItemPosition(item.id, e.target.x(), e.target.y());
                                        }}
                                        onDblClick={() => startEditingText(item.id)}
                                    />
                                );
                            }

                            return (
                                <ImageNode
                                    key={item.id}
                                    item={item}
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

            {editingTextItem && textEditorStyle && (
                <textarea
                    ref={textEditorRef}
                    value={editingTextValue}
                    onChange={(e) => setEditingTextValue(e.target.value)}
                    onBlur={saveTextEdit}
                    onMouseDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveTextEdit();
                        }
                        if (e.key === "Escape") {
                            e.preventDefault();
                            cancelTextEdit();
                        }
                    }}
                    style={textEditorStyle}
                />
            )}
        </div>
    );
}
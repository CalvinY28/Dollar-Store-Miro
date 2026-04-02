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
const PASTE_OFFSET = 30;

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

type BoardHistory = {
    past: BoardItem[][];
    future: BoardItem[][];
};

type Board = {
    id: string;
    name: string;
    items: BoardItem[];
    scale: number;
    pos: {
        x: number;
        y: number;
    };
    history: BoardHistory;
};

function cloneItems(items: BoardItem[]): BoardItem[] {
    return items.map((item) => ({ ...item }));
}

function createDefaultBoard(name = "Board 1"): Board {
    return {
        id: crypto.randomUUID(),
        name,
        items: [],
        scale: 0.25,
        pos: { x: 100, y: 80 },
        history: {
            past: [],
            future: [],
        },
    };
}

function normalizeBoard(raw: Partial<Board>, index: number, total: number): Board {
    const fallbackName =
        total === 1 && index === 0 ? "Board 1" : `Board ${index + 1}`;

    return {
        id: raw.id ?? crypto.randomUUID(),
        name:
            typeof raw.name === "string" && raw.name.trim()
                ? raw.name
                : fallbackName,
        items: Array.isArray(raw.items) ? cloneItems(raw.items) : [],
        scale: typeof raw.scale === "number" ? raw.scale : 0.25,
        pos:
            raw.pos && typeof raw.pos.x === "number" && typeof raw.pos.y === "number"
                ? raw.pos
                : { x: 100, y: 80 },
        history: {
            past: [],
            future: [],
        },
    };
}

function getNextBoardName(boards: Board[]): string {
    let maxNumber = 0;

    for (const board of boards) {
        const match = board.name.match(/^Board\s+(\d+)$/i);
        if (match) {
            const value = Number(match[1]);
            if (!Number.isNaN(value)) {
                maxNumber = Math.max(maxNumber, value);
            }
        }
    }

    return `Board ${maxNumber + 1}`;
}

function ImageNode({
    item,
    shapeRefs,
    onSelect,
    onDragStart,
    onDragEnd,
}: {
    item: ImageItem;
    shapeRefs: React.MutableRefObject<Record<string, Konva.Text | Konva.Image | null>>;
    onSelect: (e: KonvaEventObject<MouseEvent>, id: string) => void;
    onDragStart: (id: string) => void;
    onDragEnd: (id: string, e: KonvaEventObject<DragEvent>) => void;
}) {
    const [image, setImage] = useState<HTMLImageElement | undefined>(undefined);

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
            onMouseDown={(e) => onSelect(e, item.id)}
            onClick={(e) => onSelect(e, item.id)}
            onDragStart={() => onDragStart(item.id)}
            onDragEnd={(e) => onDragEnd(item.id, e)}
        />
    );
}

export default function App() {
    const stageRef = useRef<Konva.Stage | null>(null);
    const trRef = useRef<Konva.Transformer | null>(null);
    const shapeRefs = useRef<Record<string, Konva.Text | Konva.Image | null>>({});
    const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const boardNameInputRef = useRef<HTMLInputElement | null>(null);

    const dragStartPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
    const clipboardRef = useRef<BoardItem[]>([]);
    const lastBoardPointerRef = useRef<{ x: number; y: number }>({ x: 300, y: 200 });

    const [boards, setBoards] = useState<Board[]>(() => {
        const saved = localStorage.getItem("board-app-boards");
        if (!saved) return [createDefaultBoard("Board 1")];

        try {
            const parsed = JSON.parse(saved) as Partial<Board>[];
            const normalized =
                parsed.length > 0
                    ? parsed.map((board, index) =>
                        normalizeBoard(board, index, parsed.length)
                    )
                    : [createDefaultBoard("Board 1")];

            if (normalized.length === 1) {
                normalized[0] = { ...normalized[0], name: "Board 1" };
            }

            return normalized;
        } catch {
            return [createDefaultBoard("Board 1")];
        }
    });

    const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isPanning, setIsPanning] = useState(false);
    const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 });

    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [editingTextValue, setEditingTextValue] = useState("");

    const [renamingBoard, setRenamingBoard] = useState(false);
    const [renamingBoardValue, setRenamingBoardValue] = useState("");

    const [darkMode, setDarkMode] = useState<boolean>(() => {
        const saved = localStorage.getItem("board-app-dark-mode");
        return saved === "true";
    });

    useEffect(() => {
        if (!activeBoardId && boards.length > 0) {
            setActiveBoardId(boards[0].id);
        }
    }, [activeBoardId, boards]);

    useEffect(() => {
        try {
            const boardsToSave = boards.map((board) => ({
                ...board,
                history: {
                    past: [],
                    future: [],
                },
            }));

            localStorage.setItem("board-app-boards", JSON.stringify(boardsToSave));
        } catch (error) {
            console.error("Failed to save boards to local storage:", error);
        }
    }, [boards]);

    useEffect(() => {
        localStorage.setItem("board-app-dark-mode", String(darkMode));
    }, [darkMode]);

    const activeBoard = boards.find((board) => board.id === activeBoardId) ?? null;
    const activeBoardIndex = boards.findIndex((board) => board.id === activeBoardId);
    const scale = activeBoard?.scale ?? 0.25;
    const pos = activeBoard?.pos ?? { x: 100, y: 80 };
    const items = activeBoard?.items ?? [];

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

    const commitActiveBoardItems = (updater: (items: BoardItem[]) => BoardItem[]) => {
        updateActiveBoard((board) => {
            const nextItems = updater(board.items);

            return {
                ...board,
                items: nextItems,
                history: {
                    past: [...board.history.past, cloneItems(board.items)],
                    future: [],
                },
            };
        });
    };

    const getBoardPointerPosition = () => {
        const stage = stageRef.current;
        if (!stage) return lastBoardPointerRef.current;

        const pointer = stage.getPointerPosition();
        if (!pointer) return lastBoardPointerRef.current;

        return {
            x: (pointer.x - pos.x) / scale,
            y: (pointer.y - pos.y) / scale,
        };
    };

    const clampToBoard = (point: { x: number; y: number }) => {
        return {
            x: Math.max(0, Math.min(BOARD_WIDTH - 10, point.x)),
            y: Math.max(0, Math.min(BOARD_HEIGHT - 10, point.y)),
        };
    };

    const updateLastBoardPointer = (e: KonvaEventObject<MouseEvent | DragEvent | WheelEvent>) => {
        const stage = e.target.getStage();
        if (!stage) return;

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        lastBoardPointerRef.current = clampToBoard({
            x: (pointer.x - pos.x) / scale,
            y: (pointer.y - pos.y) / scale,
        });
    };

    const undoActiveBoard = () => {
        if (!activeBoard) return;
        if (activeBoard.history.past.length === 0) return;

        updateActiveBoard((board) => {
            const previous = board.history.past[board.history.past.length - 1];

            return {
                ...board,
                items: cloneItems(previous),
                history: {
                    past: board.history.past.slice(0, -1),
                    future: [cloneItems(board.items), ...board.history.future],
                },
            };
        });

        setSelectedIds([]);
        setEditingTextId(null);
    };

    const redoActiveBoard = () => {
        if (!activeBoard) return;
        if (activeBoard.history.future.length === 0) return;

        updateActiveBoard((board) => {
            const next = board.history.future[0];

            return {
                ...board,
                items: cloneItems(next),
                history: {
                    past: [...board.history.past, cloneItems(board.items)],
                    future: board.history.future.slice(1),
                },
            };
        });

        setSelectedIds([]);
        setEditingTextId(null);
    };

    useEffect(() => {
        shapeRefs.current = {};
    }, [activeBoardId]);

    useEffect(() => {
        if (!trRef.current) return;

        if (selectedIds.length === 0 || editingTextId) {
            trRef.current.nodes([]);
            trRef.current.getLayer()?.batchDraw();
            return;
        }

        const nodes = selectedIds
            .map((id) => shapeRefs.current[id])
            .filter(Boolean) as Array<Konva.Text | Konva.Image>;

        trRef.current.nodes(nodes);
        trRef.current.getLayer()?.batchDraw();
    }, [selectedIds, items, activeBoardId, editingTextId]);

    useEffect(() => {
        if (editingTextId && textEditorRef.current) {
            textEditorRef.current.focus();
            textEditorRef.current.select();
        }
    }, [editingTextId]);

    useEffect(() => {
        if (renamingBoard && boardNameInputRef.current) {
            boardNameInputRef.current.focus();
            boardNameInputRef.current.select();
        }
    }, [renamingBoard]);

    const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();

        const stage = e.target.getStage();
        if (!stage || !activeBoard || editingTextId || renamingBoard) return;

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

        lastBoardPointerRef.current = clampToBoard(mousePointTo);

        updateActiveBoard((board) => ({
            ...board,
            scale: clampedScale,
            pos: newPos,
        }));
    };

    const addBoard = () => {
        const newBoard = createDefaultBoard(getNextBoardName(boards));
        setBoards((prev) => [...prev, newBoard]);
        setActiveBoardId(newBoard.id);
        setSelectedIds([]);
        setEditingTextId(null);
    };

    const goToBoardByIndex = (index: number) => {
        if (index < 0 || index >= boards.length) return;
        setActiveBoardId(boards[index].id);
        setSelectedIds([]);
        setEditingTextId(null);
        setRenamingBoard(false);
    };

    const deleteActiveBoard = () => {
        if (!activeBoard) return;
        if (boards.length <= 1) return;

        const currentIndex = boards.findIndex((board) => board.id === activeBoard.id);
        const remainingBoards = boards.filter((board) => board.id !== activeBoard.id);

        setBoards(remainingBoards);

        const nextBoard =
            remainingBoards[currentIndex] ??
            remainingBoards[currentIndex - 1] ??
            remainingBoards[0] ??
            null;

        setActiveBoardId(nextBoard ? nextBoard.id : null);
        setSelectedIds([]);
        setEditingTextId(null);
        setRenamingBoard(false);
    };

    const startRenamingBoard = () => {
        if (!activeBoard) return;
        setRenamingBoardValue(activeBoard.name);
        setRenamingBoard(true);
    };

    const saveRenamingBoard = () => {
        if (!activeBoard) return;

        const trimmed = renamingBoardValue.trim();
        if (!trimmed) {
            setRenamingBoard(false);
            setRenamingBoardValue("");
            return;
        }

        updateActiveBoard((board) => ({
            ...board,
            name: trimmed,
        }));

        setRenamingBoard(false);
        setRenamingBoardValue("");
    };

    const cancelRenamingBoard = () => {
        setRenamingBoard(false);
        setRenamingBoardValue("");
    };

    const addText = () => {
        const spawn = clampToBoard(getBoardPointerPosition());

        const newText: TextItem = {
            id: crypto.randomUUID(),
            type: "text",
            x: spawn.x,
            y: spawn.y,
            text: "Double-click to edit",
            fontSize: 32,
            width: 320,
        };

        commitActiveBoardItems((currentItems) => [...currentItems, newText]);
        setSelectedIds([newText.id]);
    };

    const addImageFromFile = (file: File) => {
        const spawn = clampToBoard(getBoardPointerPosition());
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
                    x: spawn.x,
                    y: spawn.y,
                    width: img.width * imageScale,
                    height: img.height * imageScale,
                    src,
                };

                commitActiveBoardItems((currentItems) => [...currentItems, newImage]);
                setSelectedIds([newImage.id]);
            };
        };

        reader.readAsDataURL(file);
    };

    const startEditingText = (id: string) => {
        if (selectedIds.length > 1) return;

        const item = items.find((i) => i.id === id && i.type === "text");
        if (!item || item.type !== "text") return;

        setSelectedIds([id]);
        setEditingTextId(id);
        setEditingTextValue(item.text);
    };

    const saveTextEdit = () => {
        if (!editingTextId) return;

        commitActiveBoardItems((currentItems) =>
            currentItems.map((i) =>
                i.id === editingTextId && i.type === "text"
                    ? { ...i, text: editingTextValue }
                    : i
            )
        );

        setEditingTextId(null);
    };

    const cancelTextEdit = () => {
        setEditingTextId(null);
    };

    const selectItem = (e: KonvaEventObject<MouseEvent>, id: string) => {
        const isShift = e.evt.shiftKey;

        if (isShift) {
            setSelectedIds((prev) =>
                prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
            );
            return;
        }

        setSelectedIds((prev) => {
            if (prev.length === 1 && prev[0] === id) return prev;
            return [id];
        });
    };

    const handleItemDragStart = (id: string) => {
        const idsToMove = selectedIds.includes(id) ? selectedIds : [id];
        if (!selectedIds.includes(id)) {
            setSelectedIds([id]);
        }

        const startPositions: Record<string, { x: number; y: number }> = {};
        for (const item of items) {
            if (idsToMove.includes(item.id)) {
                startPositions[item.id] = { x: item.x, y: item.y };
            }
        }
        dragStartPositionsRef.current = startPositions;
    };

    const handleItemDragEnd = (id: string, e: KonvaEventObject<DragEvent>) => {
        const movedNode = e.target;
        const startPositions = dragStartPositionsRef.current;
        const movedStart = startPositions[id];

        if (!movedStart) return;

        const dx = movedNode.x() - movedStart.x;
        const dy = movedNode.y() - movedStart.y;
        const idsToMove = selectedIds.includes(id) ? selectedIds : [id];

        commitActiveBoardItems((currentItems) =>
            currentItems.map((item) =>
                idsToMove.includes(item.id)
                    ? {
                        ...item,
                        x: startPositions[item.id].x + dx,
                        y: startPositions[item.id].y + dy,
                    }
                    : item
            )
        );
    };

    const applyTransform = () => {
        if (selectedIds.length === 0) return;

        const nodeMap = selectedIds
            .map((id) => {
                const item = items.find((i) => i.id === id);
                const node = shapeRefs.current[id];
                if (!item || !node) return null;
                return { id, item, node };
            })
            .filter(Boolean) as Array<{
                id: string;
                item: BoardItem;
                node: Konva.Text | Konva.Image;
            }>;

        if (nodeMap.length === 0) return;

        commitActiveBoardItems((currentItems) =>
            currentItems.map((currentItem) => {
                const found = nodeMap.find((entry) => entry.id === currentItem.id);
                if (!found) return currentItem;

                const { item, node } = found;

                if (item.type === "image") {
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    node.scaleX(1);
                    node.scaleY(1);

                    return {
                        ...currentItem,
                        x: node.x(),
                        y: node.y(),
                        width: Math.max(20, node.width() * scaleX),
                        height: Math.max(20, node.height() * scaleY),
                    };
                }

                const scaleX = node.scaleX();

                node.scaleX(1);
                node.scaleY(1);

                return {
                    ...currentItem,
                    x: node.x(),
                    y: node.y(),
                    width: Math.max(80, node.width() * scaleX),
                    fontSize: Math.max(8, item.fontSize * scaleX),
                };
            })
        );
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
        const handlePasteImage = (e: ClipboardEvent) => {
            const pastedItems = e.clipboardData?.items;
            if (!pastedItems || !activeBoardId) return false;

            for (const item of Array.from(pastedItems)) {
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                        addImageFromFile(file);
                        return true;
                    }
                }
            }

            return false;
        };

        const isTypingInInput = (target: EventTarget | null) => {
            const el = target as HTMLElement | null;
            if (!el) return false;
            const tag = el.tagName;
            return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isTypingInInput(e.target)) return;

            const key = e.key.toLowerCase();

            const isUndo =
                (e.ctrlKey || e.metaKey) && !e.shiftKey && key === "z";
            const isRedo =
                ((e.ctrlKey || e.metaKey) && key === "y") ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "z");
            const isCopy = (e.ctrlKey || e.metaKey) && key === "c";
            const isPaste = (e.ctrlKey || e.metaKey) && key === "v";
            const isDeleteBoard = (e.ctrlKey || e.metaKey) && key === "r";

            if (editingTextId || renamingBoard) return;

            if (isUndo) {
                e.preventDefault();
                undoActiveBoard();
                return;
            }

            if (isRedo) {
                e.preventDefault();
                redoActiveBoard();
                return;
            }

            if (isDeleteBoard) {
                e.preventDefault();
                deleteActiveBoard();
                return;
            }

            if (isCopy) {
                if (selectedIds.length === 0) return;
                e.preventDefault();
                clipboardRef.current = cloneItems(
                    items.filter((item) => selectedIds.includes(item.id))
                );
                return;
            }

            if (isPaste) {
                const pastedImage = handlePasteImage(e as unknown as ClipboardEvent);
                if (pastedImage) {
                    e.preventDefault();
                    return;
                }

                if (clipboardRef.current.length > 0) {
                    e.preventDefault();

                    const newItems = clipboardRef.current.map((item) => ({
                        ...item,
                        id: crypto.randomUUID(),
                        x: item.x + PASTE_OFFSET,
                        y: item.y + PASTE_OFFSET,
                    }));

                    commitActiveBoardItems((currentItems) => [...currentItems, ...newItems]);
                    setSelectedIds(newItems.map((item) => item.id));
                }
                return;
            }

            if (e.key === "Delete" || e.key === "Backspace") {
                if (selectedIds.length > 0) {
                    e.preventDefault();
                    commitActiveBoardItems((currentItems) =>
                        currentItems.filter((item) => !selectedIds.includes(item.id))
                    );
                    setSelectedIds([]);
                }
                return;
            }

            if (e.key === "ArrowLeft") {
                e.preventDefault();
                if (activeBoardIndex > 0) {
                    goToBoardByIndex(activeBoardIndex - 1);
                }
                return;
            }

            if (e.key === "ArrowRight") {
                e.preventDefault();
                if (activeBoardIndex >= 0 && activeBoardIndex < boards.length - 1) {
                    goToBoardByIndex(activeBoardIndex + 1);
                }
                return;
            }

            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                if (key === "d") {
                    e.preventDefault();
                    setDarkMode((prev) => !prev);
                    return;
                }

                if (key === "q") {
                    e.preventDefault();
                    addText();
                    return;
                }

                if (key === "w") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                    return;
                }

                if (key === "e") {
                    e.preventDefault();
                    exportBoardAsPDF();
                    return;
                }

                if (key === "r") {
                    e.preventDefault();
                    addBoard();
                    return;
                }
            }
        };

        const handlePaste = (e: ClipboardEvent) => {
            if (editingTextId || renamingBoard) return;
            handlePasteImage(e);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("paste", handlePaste);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("paste", handlePaste);
        };
    }, [selectedIds, activeBoardId, editingTextId, renamingBoard, activeBoard, items, activeBoardIndex, boards.length]);

    const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
        if (editingTextId || renamingBoard) return;

        updateLastBoardPointer(e);

        const clickedOnStage = e.target === e.target.getStage();
        const clickedOnBoardBackground = e.target.name() === "board-background";

        if (clickedOnStage || clickedOnBoardBackground) {
            if (!e.evt.shiftKey) {
                setSelectedIds([]);
            }
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
        updateLastBoardPointer(e);

        if (!isPanning || !activeBoard || editingTextId || renamingBoard) return;

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

        const left = pos.x + editingTextItem.x * scale;
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
            color: darkMode ? "#f5f5f5" : "#000",
            background: darkMode ? "#2b2b2b" : "#fff",
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
    }, [editingTextItem, pos, scale, darkMode]);

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                background: darkMode ? "#1f1f1f" : "#d9d9d9",
                position: "relative",
            }}
            onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
            }}
        >
            <input
                ref={fileInputRef}
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

            <div
                style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    zIndex: 15,
                    background: darkMode ? "rgba(30,30,30,0.92)" : "rgba(255,255,255,0.9)",
                    border: darkMode ? "1px solid #555" : "1px solid #bbb",
                    color: darkMode ? "#f3f3f3" : "#111",
                    padding: "8px 10px",
                    fontSize: "12px",
                    lineHeight: 1.4,
                    borderRadius: "6px",
                    userSelect: "none",
                    minWidth: "120px",
                }}
            >
                <div>Board {activeBoardIndex + 1}/{boards.length}</div>

                {renamingBoard ? (
                    <input
                        ref={boardNameInputRef}
                        value={renamingBoardValue}
                        onChange={(e) => setRenamingBoardValue(e.target.value)}
                        onBlur={saveRenamingBoard}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                saveRenamingBoard();
                            }
                            if (e.key === "Escape") {
                                e.preventDefault();
                                cancelRenamingBoard();
                            }
                        }}
                        style={{
                            marginTop: "4px",
                            width: "100%",
                            boxSizing: "border-box",
                            fontSize: "12px",
                            background: darkMode ? "#2a2a2a" : "#fff",
                            color: darkMode ? "#f3f3f3" : "#111",
                            border: darkMode ? "1px solid #666" : "1px solid #bbb",
                        }}
                    />
                ) : (
                    <div
                        onDoubleClick={startRenamingBoard}
                        title="Double-click to rename board"
                        style={{
                            marginTop: "4px",
                            cursor: "text",
                            color: darkMode ? "#f3f3f3" : "#111",
                        }}
                    >
                        {activeBoard ? activeBoard.name : ""}
                    </div>
                )}

            </div>

            <Stage
                ref={stageRef}
                width={window.innerWidth}
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
                        fill={darkMode ? "#2b2b2b" : "white"}
                        stroke={darkMode ? "#666" : "#999"}
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
                                    fill={darkMode ? "#f5f5f5" : "black"}
                                    visible={!isEditing}
                                    draggable={!isEditing}
                                    onMouseDown={(e) => selectItem(e, item.id)}
                                    onClick={(e) => selectItem(e, item.id)}
                                    onDragStart={() => handleItemDragStart(item.id)}
                                    onDragEnd={(e: KonvaEventObject<DragEvent>) => {
                                        handleItemDragEnd(item.id, e);
                                    }}
                                    onDblClick={() => startEditingText(item.id)}
                                />
                            );
                        }

                        return (
                            <ImageNode
                                key={item.id}
                                item={item}
                                shapeRefs={shapeRefs}
                                onSelect={selectItem}
                                onDragStart={handleItemDragStart}
                                onDragEnd={handleItemDragEnd}
                            />
                        );
                    })}

                    <Transformer
                        ref={trRef}
                        rotateEnabled={false}
                        keepRatio={false}
                        onTransformEnd={applyTransform}
                    />
                </Layer>
            </Stage>

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

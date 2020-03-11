import React, { useRef, useState } from "react";
import "./Canvas.css";
import _ from "lodash";
import { ensure } from "../common";
import { mkid } from "../model";

const RECT_BORDER_STYLE = {
  selected: '1px solid blue',
  lassoParent: '1px solid green',
  lassoChildren: '1px solid red'
}

function makeLassoRawRect(_lasso, e) {
  const left = Math.min(_lasso.initialMouse.clientX, e.clientX),
    top = Math.min(_lasso.initialMouse.clientY, e.clientY),
    right = Math.max(_lasso.initialMouse.clientX, e.clientX),
    bottom = Math.max(_lasso.initialMouse.clientY, e.clientY);

  const lassoBbox = {
    top: top - _lasso.canvasPos.top,
    left: left - _lasso.canvasPos.left,
    height: bottom - top,
    width: right - left
  };
  return lassoBbox;
}

function rectContain(rect1, rect2) {
  return (rect1.left < rect2.left) &&
    (rect1.top < rect2.top) && 
    (rect1.left + rect1.width > rect2.left + rect2.width) &&
    (rect1.top + rect1.height > rect2.top + rect2.height)
}

export function Canvas() {
  const [appState, setAppState] = React.useState(
    JSON.parse(localStorage.getItem("appState") || "null") || {
      rectsById: {}
    }
  );

  const [selectedRectId, setSelectedRectId] = React.useState(undefined);

  const [lassoState, setLassoState] = React.useState(undefined);

  const [moveState, setMoveState] = React.useState(undefined);

  const [mode, setMode] = useState("select");

  const canvasRef = useRef(null);

  function addRect(rect) {
    setAppState({
      ...appState,
      rectsById: {
        ...appState.rectsById,
        [rect.id]: rect
      }
    });
    setSelectedRectId(rect.id);
  }

  function addRandomRects(num) {
    const rects = _.range(num).map(() => ({
      id: mkid(),
      top: Math.round(Math.random() * 500),
      left: Math.round(Math.random() * 700),
      height: 100,
      width: 100
    }));

    setAppState({
      ...appState,
      rectsById: {
        ...appState.rectsById,
        ..._.keyBy(rects, r => r.id)
      }
    });
    
    setSelectedRectId(undefined);
  }

  function deleteRects(rectIds) {
    setAppState({
      ...appState,
      rectsById: _.omit(appState.rectsById, ...rectIds)
    });
  }
  function updateRect(rect) {
    setAppState({
      ...appState,
      rectsById: {
        ...appState.rectsById,
        [rect.id]: rect
      }
    });
  }

  function getCanvasPos() {
    return _.pick(
      ensure(canvasRef.current).getBoundingClientRect(),
      "top",
      "left"
    )
  }

  function getRectBorderStyle(rectId) {
    if (rectId === selectedRectId) {
        return RECT_BORDER_STYLE.selected;
    } else if (lassoState && rectId === lassoState.parent) {
      return RECT_BORDER_STYLE.lassoParent;
    } else if (moveState && rectId === moveState.parent) {
      return RECT_BORDER_STYLE.lassoParent;
    } else if (lassoState && lassoState.children.includes(rectId)) {
      return RECT_BORDER_STYLE.lassoChildren;
    } else {
      return undefined
    }
  }

  function getLeafMostRectContaining(rt, excludeSelectedRect = false) {
    let leafMostRectId = null
    
    Object.values(appState.rectsById).forEach(rect => {
      if (excludeSelectedRect && selectedRectId === rect.id) {
        return
      }
      if (rectContain(rect, rt)) {
        if (leafMostRectId) {
          const leafMostRect = appState.rectsById[leafMostRectId];
          if (rectContain(leafMostRect, rect)) {
            leafMostRectId = rect.id
          }
        } else {
          leafMostRectId = rect.id
        }
      }
    })
  
    return leafMostRectId
  }

  function getRootMostRectsContainedIn(rt) {
    const rootMostRectIds = []
    
    Object.values(appState.rectsById).forEach(rect => {
      if (rectContain(rt, rect)) {
        for (let i = 0; i < rootMostRectIds.length; i++) {
          const rootMostRect = appState.rectsById[rootMostRectIds[i]];
          if (rectContain(rect, rootMostRect)) {
            rootMostRectIds[i] = rect.id
            return
          } else if (rectContain(rootMostRect, rect)) {
            return
          }
        }

        rootMostRectIds.push(rect.id)
      }
    })
  
    const exclude = []

    rootMostRectIds.forEach(id => {
      id = appState.rectsById[id].parent
      
      while (id) {
        exclude.push(id)
        id = appState.rectsById[id].parent
      }
    })

    return _.difference(rootMostRectIds, exclude);
  }

  function getRectChildrenAndMe(rectId) {
    let children = []

    Object.values(appState.rectsById).forEach(rt => {
      const parents = []
      let id = rt.id
      while (id) {
        parents.push(id)
        if (id === rectId) {
          break;
        }
        id = appState.rectsById[id].parent
      }
      if (parents.includes(rectId)) {
        children = children.concat(parents)
      }
    })

    return _.uniq(children)
  }
  
  function handleRectSelect(e, rectId) {
    e.preventDefault();
    if (mode !== "select") {
      return;
    }
    setSelectedRectId(rectId);
    const initialMouse = _.pick(e, "clientX", "clientY");
    const list = getRectChildrenAndMe(rectId)
    const initialRects = list.map(id => appState.rectsById[id])

    setMoveState({
      initialMouse,
      initialRects,
      list,
      parent: null
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Delete" && selectedRectId) {
      deleteRects([getRectChildrenAndMe(selectedRectId)]);
    }
    if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
      localStorage.setItem("appState", JSON.stringify(appState));
      e.preventDefault();
    }
  }

  function handleMouseDown(e) {
    const initialMouse = _.pick(e, "clientX", "clientY");
    const canvasPos = getCanvasPos()
    const lassoBbox = {
      left: initialMouse.clientX - canvasPos.left,
      top: initialMouse.clientY - canvasPos.top,
      width: 0,
      height: 0
    }

    if (mode !== "draw") {
      const rectId = getLeafMostRectContaining(lassoBbox);
      handleRectSelect(e, rectId)
      return;
    }
    e.preventDefault();
    setSelectedRectId(undefined);

    const lassoState = {
      initialMouse,
      canvasPos,
      lassoBbox,
      parent: getLeafMostRectContaining(lassoBbox),
      children: []
    };
    setLassoState(lassoState);
  }

  function handleMouseMove(e) {
    if (moveState) {
      e.preventDefault();
      const { initialMouse, initialRects, list } = moveState;
      const deltaX = e.clientX - initialMouse.clientX;
      const deltaY = e.clientY - initialMouse.clientY;
      const rectsById = _.cloneDeep(appState.rectsById);
      const canvasPos = getCanvasPos()
      const parent = getLeafMostRectContaining({
        left: e.clientX - canvasPos.left,
        top: e.clientY - canvasPos.top,
        width: 0,
        height: 0
      }, true)

      list.forEach((id, key) => {
        const rect = rectsById[id]
        rectsById[id] = {
          ...rect,
          left: initialRects[key].left + deltaX,
          top: initialRects[key].top + deltaY
        };

        if (id === selectedRectId) {
          rectsById[id].parent = parent
        }
      })

      setMoveState({
        ...moveState,
        parent
      })

      setAppState({
        ...appState,
        rectsById
      })
    } else if (lassoState) {
      e.preventDefault();
      const lassoBbox = makeLassoRawRect(lassoState, e);
      setLassoState({
        ...lassoState,
        lassoBbox,
        parent: getLeafMostRectContaining(lassoBbox),
        children: getRootMostRectsContainedIn(lassoBbox)
      });
    }
  }

  function handleMouseUp(e) {
    if (moveState) {
      setMoveState(undefined);
    } else if (lassoState) {
      const rawRect = makeLassoRawRect(lassoState, e);
      const rect = { id: mkid(), ...rawRect, parent: lassoState.parent }
      const rectsById = _.cloneDeep(appState.rectsById);

      lassoState.children.forEach(child => {
        rectsById[child].parent = rect.id
      })
      rectsById[rect.id] = rect
      
      setLassoState(undefined);
      setAppState({
        ...appState,
        rectsById
      })
    }
  }

  return (
    <div>
      Mode:{" "}
      <select value={mode} onChange={e => setMode(e.target.value)}>
        <option value={"select"}>Select</option>
        <option value={"draw"}>Draw</option>
      </select>

      <RectAdder onAdd={addRandomRects} />
      
      <div
        className="Canvas"
        ref={canvasRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {Object.values(appState.rectsById).map(({ left, top, height, width, id }) => (
          <div
            key={id}
            className={"RectView"}
            style={{
              left,
              top,
              height,
              width,
              border: getRectBorderStyle(id)
            }}
          />
        ))}
        {lassoState && (
          <div className={"LassoView"} style={{ ...lassoState.lassoBbox }} />
        )}
      </div>
    </div>
  );
}

function RectAdder(props) {
  const [count, setCount] = React.useState("10");

  return (
    <div className="adder">
      <input
        type="text"
        value={count}
        onChange={e => setCount(e.currentTarget.value)}
      />
      <button onClick={() => props.onAdd(parseInt(count) || 1)}>
        Add random rectangles
      </button>
    </div>
  );
}

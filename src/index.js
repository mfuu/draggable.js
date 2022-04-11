/**
 * @interface Options {
 * @groupElement: HTMLElement
 * @scrollElement?: HTMLElement, // if not set, same as `groupElement`
 * @dragElement?: Function, return element node selected when dragging, or null
 * @dragEnd?: Function, The callback function when the drag is completed
 * @cloneElementStyle?: Object
 * @cloneElementClass?: String
 * @
 * }
 */

export default class Draggable {
  constructor(options) {
    this.parent = options.groupElement // 父级元素
    this.scrollElement = options.scrollElement || options.groupElement // 滚动节点

    this.dragElement = options.dragElement // 必须为函数且必须返回一个 HTMLElement (e) => return e.target
    this.dragEnd = options.dragEnd // 拖拽完成时的回调函数，返回两个值(olddom, newdom) => {}

    this.cloneElementStyle = options.cloneElementStyle // 克隆元素包含的属性
    this.cloneElementClass = options.cloneElementClass // 克隆元素的类名

    this.delay = options.delay || 300 // 动画延迟

    this.rectList = [] // 用于保存拖拽项getBoundingClientRect()方法获得的数据
    this.isMousedown = false // 记录鼠标按下
    this.isMousemove = false // 记录鼠标移动

    this.drag = { element: null, index: 0, lastIndex: 0 } // 拖拽元素
    this.drop = { element: null, index: 0, lastIndex: 0 } // 释放元素
    this.clone = { element: null, x: 0, y: 0, exist: false } // 拖拽蒙版
    this.diff = {
      old: { node: null, rect: {} },
      new: { node: null, rect: {} }
    } // 记录拖拽前后差异

    this._debounce(this.init(), 50) // 避免重复执行多次
  }
  init() {
    if (!this.parent) {
      console.error('Error: groupElement is required')
      return
    }
    this._bindEventListener()
    this._getChildrenRect()
  }
  destroy() {
    this._unbindEventListener()
    this._resetState()
  }
  // 获取元素位置信息
  _getChildrenRect() {
    this.rectList.length = 0
    for (const item of this.parent.children) {
      this.rectList.push(item.getBoundingClientRect())
    }
  }
  _handleMousedown(e) {
    if (e.button !== 0) return true
    if (e.target === this.parent) return true
    if (!this.rectList.length) this._getChildrenRect()
    try {
      // 获取拖拽元素
      const element = this.dragElement ? this.dragElement(e) : e.target
      // 不存在拖拽元素时不允许拖拽
      if (!element) return true

      this.drag.element = element
    } catch(e) {
      //
      return true
    }
    this.isMousedown = true
    // 记录拖拽移动时坐标
    const calcXY = { x: e.clientX, y: e.clientY }
    // 将拖拽元素克隆一份作为蒙版
    this.clone.element = this.drag.element.cloneNode(true)
    // 获取当前元素在列表中的位置
    const index = this._getElementIndex()
    this.diff.old.rect = this.rectList[index]
    this.clone.x = this.rectList[index].left
    this.clone.y = this.rectList[index].top
    this.drag.index = index
    this.drag.lastIndex = index

    document.onmousemove = (e) => {
      // 将初始化放在 move 事件中，避免与鼠标点击事件冲突
      this._initCloneElement()
      this._handleCloneMove()

      e.preventDefault()
      if (!this.isMousedown) return

      this.isMousemove = true
      
      this.clone.x += e.clientX - calcXY.x
      this.clone.y += e.clientY - calcXY.y
      calcXY.x = e.clientX
      calcXY.y = e.clientY
      this._handleCloneMove()

      for (let i = 0; i < this.rectList.length; i++) {
        const { left, right, top, bottom } = this.rectList[i]
        if (e.clientX > left && e.clientX < right && e.clientY > top && e.clientY < bottom) {
          this.drop.element = this.parent.children[i]
          this.drop.lastIndex = i
          if (this.drag.element !== this.drop.element) {
            if (this.drag.index < i) {
              this.parent.insertBefore(this.drag.element, this.drop.element.nextElementSibling)
              this.drop.index = i - 1
            } else {
              this.parent.insertBefore(this.drag.element, this.drop.element)
              this.drop.index = i + 1
            }
            this.drag.index = i
            // 设置动画
            this._animate(this.drag.element, this.rectList[this.drag.index], this.rectList[this.drag.lastIndex])
            this._animate(this.drop.element, this.rectList[this.drop.index], this.rectList[this.drop.lastIndex])
            this.drag.lastIndex = i
            this.diff.old.node = this.drag.element
            this.diff.new.node = this.drop.element
          }
          this.diff.new.rect = this.rectList[i]
          break
        }
      }
    }
    document.onmouseup = () => {
      document.onmousemove = null
      document.onmouseup = null
      if (this.isMousedown && this.isMousemove) {
        // 拖拽完成触发回调函数
        if (this.dragEnd) this.dragEnd(this.diff.old, this.diff.new)
      }
      this.isMousedown = false
      this.isMousemove = false
      this._destroyClone()
      this._clearDiff()
    }
  }
  _initCloneElement() {
    this.clone.element.class = this.cloneElementClass
    this.clone.element.style.transition = 'none'
    this.clone.element.style.position = 'fixed'
    this.clone.element.style.left = 0
    this.clone.element.style.top = 0
    for (const key in this.cloneElementStyle) {
      this._styled(this.clone.element, key, this.cloneElementStyle[key])
    }
    if (!this.clone.element.exist) {
      document.body.appendChild(this.clone.element)
      this.clone.element.exist = true
    }
  }
  _handleCloneMove() {
    this.clone.element.style.transform = `translate3d(${this.clone.x}px, ${this.clone.y}px, 0)`
  }
  _destroyClone() {
    this.clone.element.remove()
    this.clone = { element: null, x: 0, y: 0, exist: false }
  }
  _getElementIndex() {
    const children = Array.from(this.parent.children)
    const { element } = this.drag
    // 如果能直接在子元素中找到，返回对应的index
    let index = children.indexOf(element)
    if (index > -1) return index
    // children 中无法直接找到对应的dom时，需要向下寻找
    for (let i = 0; i < children.length; i++) {
      if (this._isChildOf(element, children[i])) return i
    }
  }
  // 判断子元素是否包含在父元素中
  _isChildOf(child, parent) {
    let parentNode
    if (child && parent) {
      parentNode = child.parentNode
      while (parentNode) {
        if (parent === parentNode) return true
        parentNode = parentNode.parentNode
      }
    }
    return false
  }
  _animate(element, rect, lastRect) {
    this._styled(element, 'transition', 'none')
    this._styled(element, 'transform', `translate3d(${lastRect.left - rect.left}px, ${lastRect.top - rect.top}px, 0)`)
    element.offsetLeft // 触发重绘
    this._styled(element, 'transition', `all ${this.delay}ms`)
    this._styled(element, 'transform', 'translate3d(0px, 0px, 0px)')
    clearTimeout(element.animated)
    element.animated = setTimeout(() => {
      this._styled(element, 'transition', '')
      this._styled(element, 'transform', '')
      element.animated = null
    }, this.delay)
  }
  _styled(el, prop, val) {
    const style = el && el.style
    if (style) {
      if (val === void 0) {
        if (document.defaultView && document.defaultView.getComputedStyle)  val = document.defaultView.getComputedStyle(el, '')
        else if (el.currentStyle)  val = el.currentStyle
        return prop === void 0 ? val : val[prop]
      } else {
        if (!(prop in style)) prop = '-webkit-' + prop
        style[prop] = val + (typeof val === 'string' ? '' : 'px')
      }
    }
  }
  _resetState() {
    this.isMousedown = false
    this.isMousemove = false
    this.rectList.length = 0
    this.drag = { element: null, index: 0, lastIndex: 0 }
    this.drop = { element: null, index: 0, lastIndex: 0 }
    this._destroyClone()
    this._clearDiff()
  }
  _clearDiff() {
    this.diff = {
      old: { node: null, rect: {} },
      new: { node: null, rect: {} }
    }
  }
  _bindEventListener() {
    this._handleMousedown = this._handleMousedown.bind(this)
    this._getChildrenRect = this._getChildrenRect.bind(this)
    this.parent.addEventListener('mousedown', this._handleMousedown)
    this.scrollElement.addEventListener('scroll', this._debounce(this._getChildrenRect, 50))
    window.addEventListener('scroll', this._debounce(this._getChildrenRect, 50))
    window.addEventListener('resize', this._debounce(this._getChildrenRect, 50))
    window.addEventListener('orientationchange', this._debounce(this._getChildrenRect, 50))
  }
  _unbindEventListener() {
    this.parent.removeEventListener('mousedown', this._handleMousedown)
    this.scrollElement.removeEventListener('scroll', this._getChildrenRect)
    window.removeEventListener('scroll', this._getChildrenRect)
    window.removeEventListener('resize', this._getChildrenRect)
    window.removeEventListener('orientationchange', this._getChildrenRect)
  }
  _debounce(fn, delay) {
    return function (...args) {
      clearTimeout(fn.id)
      fn.id = setTimeout(() => {
        fn.call(this, ...args)
      }, delay)
    }
  }
}


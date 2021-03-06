import { deepClone } from '../utils/deep-clone';
import { use, isObj, range } from '../utils';
import { preventDefault } from '../utils/event';
import { TouchMixin } from '../mixins/touch';

const DEFAULT_DURATION = 200;

// 惯性滑动思路:
// 在手指离开屏幕时，如果和上一次 move 时的间隔小于 `MOMENTUM_LIMIT_TIME` 且 move 距
// 离大于 `MOMENTUM_LIMIT_DISTANCE` 时，执行惯性滑动，持续 `MOMENTUM_DURATION`
const MOMENTUM_DURATION = 1500;
const MOMENTUM_LIMIT_TIME = 300;
const MOMENTUM_LIMIT_DISTANCE = 15;

const [sfc, bem] = use('picker-column');

export default sfc({
  mixins: [TouchMixin],

  props: {
    valueKey: String,
    className: String,
    itemHeight: Number,
    defaultIndex: Number,
    initialOptions: Array,
    visibleItemCount: Number
  },

  data() {
    return {
      offset: 0,
      duration: 0,
      startOffset: 0,
      momentumOffset: 0,
      touchTimestamp: 0,
      moving: false,
      options: deepClone(this.initialOptions),
      currentIndex: this.defaultIndex
    };
  },

  created() {
    this.$parent.children && this.$parent.children.push(this);
    this.setIndex(this.currentIndex);
  },

  destroyed() {
    const { children } = this.$parent;
    children && children.splice(children.indexOf(this), 1);
  },

  watch: {
    defaultIndex() {
      this.setIndex(this.defaultIndex);
    }
  },

  computed: {
    count() {
      return this.options.length;
    }
  },

  methods: {
    onTouchStart(event) {
      this.touchStart(event);

      if (this.moving) {
        const { translateY } = this.getEleTransform(this.$refs.wrapper);
        this.startOffset = Math.min(0, translateY);
      } else {
        this.startOffset = this.offset;
      }

      this.duration = 0;
      this.moving = false;
      this.transitionEndTrigger = null;
      this.touchTimestamp = Date.now();
      this.momentumOffset = this.startOffset;
    },

    onTouchMove(event) {
      preventDefault(event);
      this.moving = true;
      this.touchMove(event);
      this.offset = range(
        this.startOffset + this.deltaY,
        -(this.count * this.itemHeight),
        this.itemHeight
      );

      const now = Date.now();
      if (now - this.touchTimestamp > MOMENTUM_LIMIT_TIME) {
        this.touchTimestamp = now;
        this.momentumOffset = this.offset;
      }
    },

    onTouchEnd() {
      const distance = this.offset - this.momentumOffset;
      const duration = Date.now() - this.touchTimestamp;
      const allowMomentum =
        duration < MOMENTUM_LIMIT_TIME &&
        Math.abs(distance) > MOMENTUM_LIMIT_DISTANCE;

      if (allowMomentum) {
        this.momentum(distance, duration);
        return;
      }

      if (this.offset !== this.startOffset) {
        this.duration = DEFAULT_DURATION;
        const index = this.getIndexByOffset(this.offset);
        this.setIndex(index, true);
      }
    },

    onTransitionEnd() {
      this.moving = false;

      if (this.transitionEndTrigger) {
        this.transitionEndTrigger();
        this.transitionEndTrigger = null;
      }
    },

    onClickItem(e) {
      const index = Number(e.currentTarget.getAttribute('data-index'));
      this.duration = DEFAULT_DURATION;
      this.setIndex(index, true);
    },

    adjustIndex(index) {
      index = range(index, 0, this.count);
      for (let i = index; i < this.count; i++) {
        if (!this.isDisabled(this.options[i])) return i;
      }
      for (let i = index - 1; i >= 0; i--) {
        if (!this.isDisabled(this.options[i])) return i;
      }
    },

    isDisabled(option) {
      return isObj(option) && option.disabled;
    },

    getOptionText(option) {
      return isObj(option) && this.valueKey in option ? option[this.valueKey] : option;
    },

    setIndex(index, userAction) {
      index = this.adjustIndex(index) || 0;
      this.offset = -index * this.itemHeight;

      const trigger = () => {
        if (index !== this.currentIndex) {
          this.currentIndex = index;
          userAction && this.$emit('change', index);
        }
      };

      // 若有触发过 `touchmove` 事件，那应该
      // 在 `transitionend` 后再触发 `change` 事件
      if (this.moving) {
        this.transitionEndTrigger = trigger;
      } else {
        trigger();
      }
    },

    setValue(value) {
      const { options } = this;
      for (let i = 0; i < options.length; i++) {
        if (this.getOptionText(options[i]) === value) {
          return this.setIndex(i);
        }
      }
    },

    getValue() {
      return this.options[this.currentIndex];
    },

    getIndexByOffset(offset) {
      return range(
        Math.round(-offset / this.itemHeight),
        0,
        this.count - 1
      );
    },

    getEleTransform(ele) {
      const { transform } = window.getComputedStyle(ele);
      const matrix = transform
        .slice(7, transform.length - 1)
        .split(', ')
        .map(val => Number(val));

      return {
        scaleX: matrix[0],
        skewY: matrix[1],
        skewX: matrix[2],
        scaleY: matrix[3],
        translateX: matrix[4],
        translateY: matrix[5]
      };
    },

    momentum(distance, duration) {
      const speed = Math.abs(distance / duration);

      distance = this.offset + speed / 0.0015 * (distance < 0 ? -1 : 1);

      const index = this.getIndexByOffset(distance);

      this.duration = MOMENTUM_DURATION;
      this.setIndex(index, true);
    },
  },

  render(h) {
    const { itemHeight, visibleItemCount } = this;

    const columnStyle = {
      height: itemHeight * visibleItemCount + 'px'
    };

    const baseOffset = (itemHeight * (visibleItemCount - 1)) / 2;

    const wrapperStyle = {
      transform: `translate3d(0, ${this.offset + baseOffset}px, 0)`,
      transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
      transitionDuration: `${this.duration}ms`,
      lineHeight: `${itemHeight}px`
    };

    const optionStyle = {
      height: `${itemHeight}px`
    };

    return (
      <div
        style={columnStyle}
        class={[bem(), this.className]}
        onTouchstart={this.onTouchStart}
        onTouchmove={this.onTouchMove}
        onTouchend={this.onTouchEnd}
        onTouchcancel={this.onTouchEnd}
      >
        <ul
          ref="wrapper"
          style={wrapperStyle}
          onTransitionend={this.onTransitionEnd}
        >
          {this.options.map((option, index) => (
            <li
              style={optionStyle}
              class={[
                'van-ellipsis',
                bem('item', {
                  disabled: this.isDisabled(option),
                  selected: index === this.currentIndex
                })
              ]}
              domPropsInnerHTML={this.getOptionText(option)}
              data-index={index}
              onClick={this.onClickItem}
            />
          ))}
        </ul>
      </div>
    );
  }
});

import React from 'react';
import PropTypes from 'prop-types';
import url from 'url';
import { Promise } from 'es6-promise';
import shallowequal from 'shallowequal';
import tokenizeUrl from './tokenizeUrl';
import Tableau from 'tableau-api';

const propTypes = {
  filters: PropTypes.object,
  url: PropTypes.string,
  parameters: PropTypes.object,
  options: PropTypes.object,
  token: PropTypes.string,
};

const defaultProps = {
  loading: false,
  parameters: {},
  filters: {},
  options: {},
};

class TableauReport extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      filters: props.filters,
      parameters: props.parameters,
      viz: {},
    };
  }

  componentDidMount() {
    this.initTableau(this.props.url);
  }

  componentWillReceiveProps(nextProps) {
    const isReportChanged = nextProps.url !== this.props.url;
    const isResized = nextProps.options.width !== this.props.options.width;
    if (isResized) {
      this.resizeViz(nextProps.options.width, nextProps.options.height);
    }
    const isFiltersChanged = !shallowequal(
      this.props.filters,
      nextProps.filters,
      this.compareArrays
    );
    const isParametersChanged = !shallowequal(
      this.props.parameters,
      nextProps.parameters
    );
    const isLoading = this.state.loading;

    // Only report is changed - re-initialize
    if (isReportChanged) {
      this.initTableau(nextProps.url);
    }

    // Only filters are changed, apply via the API
    if (!isReportChanged && isFiltersChanged && !isLoading) {
      this.applyFilters(nextProps.filters);
    }

    // Only parameters are changed, apply via the API
    if (!isReportChanged && isParametersChanged && !isLoading) {
      this.applyParameters(nextProps.parameters);
    }

    // token change, validate it.
    if (nextProps.token !== this.props.token) {
      this.setState({ didInvalidateToken: false });
    }
  }

  /**
   * Compares the values of filters to see if they are the same.
   * @param  {Array<Number>} a
   * @param  {Array<Number>} b
   * @return {Boolean}
   */
  compareArrays(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.sort().toString() === b.sort().toString();
    }

    return undefined;
  }

  /**
   * Execute a callback when an array of promises complete, regardless of
   * whether any throw an error.
   */
  onComplete(promises, cb) {
    Promise.all(promises).then(() => cb(), () => cb());
  }

  /**
   * Returns a vizUrl, tokenizing it if a token is passed and immediately
   * invalidating it to prevent it from being used more than once.
   */
  getUrl(_url) {
    const { token } = this.props;
    const parsed = url.parse(_url, true);
    // const query = '?:embed=yes&:comments=no&:toolbar=yes&:refresh=yes';
    const query = '';

    if (!this.state.didInvalidateToken && token) {
      this.invalidateToken();
      return tokenizeUrl(_url, token) + query;
    }

    return parsed.protocol + '//' + parsed.host + parsed.pathname + query;
  }

  invalidateToken() {
    this.setState({ didInvalidateToken: true });
  }

  /**
   * Asynchronously applies filters to the worksheet, excluding those that have
   * already been applied, which is determined by checking against state.
   * @param  {Object} filters
   * @return {void}
   */
  applyFilters(filters) {
    const REPLACE = Tableau.FilterUpdateType.REPLACE;
    const promises = [];

    this.setState({ loading: true });

    for (const key in filters) {
      if (
        !this.state.filters.hasOwnProperty(key) ||
        !this.compareArrays(this.state.filters[key], filters[key])
      ) {
        promises.push(this.sheet.applyFilterAsync(key, filters[key], REPLACE));
      }
    }

    this.onComplete(promises, () => this.setState({ loading: false, filters }));
  }

  applyParameters(parameters) {
    const promises = [];

    for (const key in parameters) {
      if (
        !this.state.parameters.hasOwnProperty(key) ||
        this.state.parameters[key] !== parameters[key]
      ) {
        const val = parameters[key];
        promises.push(this.workbook.changeParameterValueAsync(key, val));
      }
    }

    this.onComplete(promises, () =>
      this.setState({ loading: false, parameters })
    );
  }

  onTabSwitch(viz) {
    return this.props.getSheetUrl(
      viz
        .getWorkbook()
        .getActiveSheet()
        .getUrl()
    );
  }
  resizeViz(width, height) {
    var sheet = this.state.viz.getWorkbook().getActiveSheet();
    if (sheet) {
      if (
        sheet.getSheetType() === 'dashboard' ||
        sheet.getSheetType() === 'story'
      ) {
        sheet
          .changeSizeAsync({
            behavior: 'EXACTLY',
            maxSize: {
              height: height,
              width: width,
            },
          })
          .then(
            this.state.viz.setFrameSize(
              parseInt(width, 10),
              parseInt(height, 10)
            )
          );
      }
      if (sheet.getSheetType() === 'worksheet') {
        sheet
          .changeSizeAsync({
            behavior: 'AUTOMATIC',
            maxSize: {
              height: height,
              width: width,
            },
          })
          .then(
            this.state.viz.setFrameSize(
              parseInt(width, 10),
              parseInt(height, 10)
            )
          );
      }
    } else {
      this.state.viz.setFrameSize(parseInt(width, 10), parseInt(height, 10));
    }
  }

  /**
   * Initialize the viz via the Tableau JS API.
   * @return {void}
   */
  initTableau(_url) {
    const { filters, parameters } = this.props;
    const vizUrl = this.getUrl(_url);

    const options = {
      ...filters,
      ...parameters,
      ...this.props.options,
      onFirstInteractive: () => {
        // this.workbook = this.viz.getWorkbook();
        // this.sheets = this.workbook.getActiveSheet().getWorksheets();
        // this.sheet = this.sheets[0];
        this.viz.addEventListener(Tableau.TableauEventName.TAB_SWITCH, () =>
          this.onTabSwitch(this.viz)
        );
        this.setState({ viz: this.viz });
      },
    };

    // cleanup
    if (this.viz) {
      this.viz.dispose();
      this.setState({ viz: null });
    }

    this.viz = new Tableau.Viz(this.container, vizUrl, options);
  }

  render() {
    return <div ref={c => (this.container = c)} />;
  }
}

TableauReport.propTypes = propTypes;
TableauReport.defaultProps = defaultProps;

export default TableauReport;

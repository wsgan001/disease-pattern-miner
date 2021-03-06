'use strict';
document.body.style.cursor = 'wait';

var svg, tooltip, biHiSankey, path, defs, colorScale, highlightColorScale, isTransitioning;

var groupBy = function (xs, key) {
    return xs.reduce(function (rv, x) {
        (rv[x[key]] = rv[x[key]] || []).push(x);
        return rv;
    }, {});
};

var reduce = function (xs, key) {
    return xs.reduce(function (accumulator, currentValue) {
        return accumulator.concat(currentValue[key]);
    }, []);
};

Array.prototype.sum = function (prop) {
    var total = 0
    for (var i = 0, _len = this.length; i < _len; i++) {
        total += this[i][prop]
    }
    return total
};

var icdGroups = (function () {
    let groups = null;
    $.ajax({
        'async': false,
        'url': "/icdgroups",
        'dataType': "json",
        'success': function (data) {
            groups = data;
        }
    });

    return groups;
})();

var container = $('#chart');

var OPACITY = {
        NODE_DEFAULT: 0.9,
        NODE_FADED: 0.1,
        NODE_HIGHLIGHT: 0.8,
        LINK_DEFAULT: 0.6,
        LINK_FADED: 0.05,
        LINK_HIGHLIGHT: 0.9
    },
    TYPES = reduce(icdGroups, 'name'),
    TYPE_COLORS = reduce(icdGroups, 'color'),
    TYPE_HIGHLIGHT_COLORS = reduce(icdGroups, 'color'),
    LINK_COLOR = "#b3b3b3",
    INFLOW_COLOR = "#2E86D1",
    OUTFLOW_COLOR = "#D63028",
    NODE_WIDTH = 20,
    COLLAPSER = {
        RADIUS: NODE_WIDTH / 2,
        SPACING: 2
    },
    OUTER_MARGIN = 10,
    MARGIN = {
        TOP: 2 * (COLLAPSER.RADIUS + OUTER_MARGIN),
        RIGHT: OUTER_MARGIN,
        BOTTOM: OUTER_MARGIN,
        LEFT: OUTER_MARGIN * 2
    },
    TRANSITION_DURATION = 40,
    HEIGHT = 900 - MARGIN.TOP - MARGIN.BOTTOM,
    WIDTH = container.width() - MARGIN.LEFT - MARGIN.RIGHT,
    LAYOUT_INTERATIONS = 100,
    REFRESH_INTERVAL = 5000;

var formatIcdCode = function (node) {
    if (node.id.toString().length === 3) {
        return " [ICD Code: " + node.id + "] ";
    }
    if (node.id.toString().length < 3) {
        return " [ICD Group: " + node.id + "] ";
    }
};


var formatNumber = function (d) {
        var numberFormat = d3.format(",.0f"); // zero decimal places
        return numberFormat(d);
    },

    formatFlow = function (d) {
        var flowFormat = d3.format(",.0f"); // zero decimal places with sign
        return flowFormat(Math.abs(d));
    },

// Used when temporarily disabling user interractions to allow animations to complete
    disableUserInterractions = function (time) {
        isTransitioning = true;
        setTimeout(function () {
            isTransitioning = false;
        }, time);
    },

    hideTooltip = function () {
        return tooltip.transition()
            .duration(TRANSITION_DURATION)
            .style("opacity", 0);
    },

    showTooltip = function () {
        //var relX = event.pageX - $(this).offset().left;
        //var relY = event.pageY - $(this).offset().top;

        return tooltip
            .style("left", d3.event.pageX + "px")
            .style("top", (d3.event.pageY - 200) + "px")
            .transition()
            .duration(TRANSITION_DURATION)
            .style("opacity", 1);
    };


colorScale = d3.scale.ordinal().domain(TYPES).range(TYPE_COLORS);
highlightColorScale = d3.scale.ordinal().domain(TYPES).range(TYPE_HIGHLIGHT_COLORS);

svg = d3.select("#chart").append("svg")
    .attr("width", WIDTH + MARGIN.LEFT + MARGIN.RIGHT)
    .attr("height", HEIGHT + MARGIN.TOP + MARGIN.BOTTOM)
    .append("g")
    .attr("transform", "translate(" + MARGIN.LEFT + "," + MARGIN.TOP + ")");

svg.append("g").attr("id", "links");
svg.append("g").attr("id", "nodes");
svg.append("g").attr("id", "collapsers");

tooltip = d3.select("#chart")
    .append("div")
    .attr("id", "tooltip");

tooltip.style("opacity", 0)
    .append("p")
    .attr("class", "value");

biHiSankey = d3.biHiSankey();

// Set the biHiSankey diagram properties
biHiSankey
    .nodeWidth(NODE_WIDTH)
    .nodeSpacing(10)
    .linkSpacing(4)
    .arrowheadScaleFactor(0.5) // Specifies that 0.5 of the link's stroke WIDTH should be allowed for the marker at the end of the link.
    .size([WIDTH, HEIGHT]);

path = biHiSankey.link().curvature(0.45);

defs = svg.append("defs");

defs.append("marker")
    .style("fill", LINK_COLOR)
    .attr("id", "arrowHead")
    .attr("viewBox", "0 0 6 10")
    .attr("refX", "1")
    .attr("refY", "5")
    .attr("markerUnits", "strokeWidth")
    .attr("markerWidth", "1")
    .attr("markerHeight", "1")
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M 0 0 L 1 0 L 6 5 L 1 10 L 0 10 z");

defs.append("marker")
    .style("fill", OUTFLOW_COLOR)
    .attr("id", "arrowHeadInflow")
    .attr("viewBox", "0 0 6 10")
    .attr("refX", "1")
    .attr("refY", "5")
    .attr("markerUnits", "strokeWidth")
    .attr("markerWidth", "1")
    .attr("markerHeight", "1")
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M 0 0 L 1 0 L 6 5 L 1 10 L 0 10 z");

defs.append("marker")
    .style("fill", INFLOW_COLOR)
    .attr("id", "arrowHeadOutlow")
    .attr("viewBox", "0 0 6 10")
    .attr("refX", "1")
    .attr("refY", "5")
    .attr("markerUnits", "strokeWidth")
    .attr("markerWidth", "1")
    .attr("markerHeight", "1")
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M 0 0 L 1 0 L 6 5 L 1 10 L 0 10 z");


function update() {
    var link, linkEnter, node, nodeEnter, collapser, collapserEnter;

    function dragmove(node) {
        node.x = Math.max(0, Math.min(WIDTH - node.width, d3.event.x));
        node.y = Math.max(0, Math.min(HEIGHT - node.height, d3.event.y));
        d3.select(this).attr("transform", "translate(" + node.x + "," + node.y + ")");
        biHiSankey.relayout();
        svg.selectAll(".node").selectAll("rect").attr("height", function (d) {
            return d.height;
        });
        link.attr("d", path);
    }

    function containChildren(node) {
        node.children.forEach(function (child) {
            child.state = "contained";
            child.parent = this;
            child._parent = null;
            containChildren(child);
        }, node);
    }

    function expand(node) {
        node.state = "expanded";
        node.children.forEach(function (child) {
            child.state = "collapsed";
            child._parent = this;
            child.parent = null;
            containChildren(child);
        }, node);
    }

    function collapse(node) {
        node.state = "collapsed";
        containChildren(node);
    }

    function restoreLinksAndNodes() {
        link
            .style("stroke", LINK_COLOR)
            .style("marker-end", function () {
                return 'url(#arrowHead)';
            })
            .transition()
            .duration(TRANSITION_DURATION)
            .style("opacity", OPACITY.LINK_DEFAULT);

        node
            .selectAll("rect")
            .style("fill", function (d) {
                d.color = colorScale(d.type.replace(/ .*/, ""));
                return d.color;
            })
            .style("stroke", function (d) {
                return d3.rgb(colorScale(d.type.replace(/ .*/, ""))).darker(0.1);
            })
            .style("fill-opacity", OPACITY.NODE_DEFAULT);

        node.filter(function (n) {
            return n.state === "collapsed";
        })
            .transition()
            .duration(TRANSITION_DURATION)
            .style("opacity", OPACITY.NODE_DEFAULT);
    }

    function showHideChildren(node) {
        disableUserInterractions(2 * TRANSITION_DURATION);
        hideTooltip();
        if (node.state === "collapsed") {
            expand(node);
        } else {
            collapse(node);
        }

        biHiSankey.relayout();
        update();
        link.attr("d", path);
        restoreLinksAndNodes();
    }

    function highlightConnected(g) {
        link.filter(function (d) {
            return d.source === g;
        })
            .style("marker-end", function () {
                return 'url(#arrowHeadInflow)';
            })
            .style("stroke", OUTFLOW_COLOR)
            .style("opacity", OPACITY.LINK_DEFAULT);

        link.filter(function (d) {
            return d.target === g;
        })
            .style("marker-end", function () {
                return 'url(#arrowHeadOutlow)';
            })
            .style("stroke", INFLOW_COLOR)
            .style("opacity", OPACITY.LINK_DEFAULT);
    }

    function fadeUnconnected(g) {
        link.filter(function (d) {
            return d.source !== g && d.target !== g;
        })
            .style("marker-end", function () {
                return 'url(#arrowHead)';
            })
            .transition()
            .duration(TRANSITION_DURATION)
            .style("opacity", OPACITY.LINK_FADED);

        node.filter(function (d) {
            return (d.name === g.name) ? false : !biHiSankey.connected(d, g);
        }).transition()
            .duration(TRANSITION_DURATION)
            .style("opacity", OPACITY.NODE_FADED);
    }


    link = svg.select("#links").selectAll("path.link")
        .data(biHiSankey.visibleLinks(), function (d) {
            return d.id;
        });

    link.transition()
        .duration(TRANSITION_DURATION)
        .style("stroke-WIDTH", function (d) {
            return Math.max(1, d.thickness);
        })
        .attr("d", path)
        .style("opacity", OPACITY.LINK_DEFAULT);


    link.exit().remove();


    linkEnter = link.enter().append("path")
        .attr("class", "link")
        .style("fill", "none");

    linkEnter.on('mouseenter', function (d) {
        if (!isTransitioning) {
            showTooltip().select(".value").text(function () {
                if (d.direction > 0) {
                    return formatIcdCode(d.source) + d.source.name + " → " + formatIcdCode(d.target) + d.target.name + "\n" + "Support: " + formatNumber(d.value);
                }
                return formatIcdCode(d.target) + d.target.name + " ← " + formatIcdCode(d.source) + d.source.name + "\n" + "Support: " + formatNumber(d.value);
            });

            d3.select(this)
                .style("stroke", LINK_COLOR)
                .transition()
                .duration(TRANSITION_DURATION / 2)
                .style("opacity", OPACITY.LINK_HIGHLIGHT);
        }
    });

    linkEnter.on('mouseleave', function () {
        if (!isTransitioning) {
            hideTooltip();

            d3.select(this)
                .style("stroke", LINK_COLOR)
                .transition()
                .duration(TRANSITION_DURATION / 2)
                .style("opacity", OPACITY.LINK_DEFAULT);
        }
    });

    linkEnter.sort(function (a, b) {
        return b.thickness - a.thickness;
    })
        .classed("leftToRight", function (d) {
            return d.direction > 0;
        })
        .classed("rightToLeft", function (d) {
            return d.direction < 0;
        })
        .style("marker-end", function () {
            return 'url(#arrowHead)';
        })
        .style("stroke", LINK_COLOR)
        .style("opacity", 0)
        .transition()
        .delay(TRANSITION_DURATION)
        .duration(TRANSITION_DURATION)
        .attr("d", path)
        .style("stroke-WIDTH", function (d) {
            return Math.max(1, d.thickness);
        })
        .style("opacity", OPACITY.LINK_DEFAULT);


    node = svg.select("#nodes").selectAll(".node")
        .data(biHiSankey.collapsedNodes(), function (d) {
            return d.id;
        });


    node.transition()
        .duration(TRANSITION_DURATION)
        .attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        })
        .style("opacity", OPACITY.NODE_DEFAULT)
        .select("rect")
        .style("fill", function (d) {
            d.color = colorScale(d.type.replace(/ .*/, ""));
            return d.color;
        })
        .style("stroke", function (d) {
            return d3.rgb(colorScale(d.type.replace(/ .*/, ""))).darker(0.1);
        })
        .style("stroke-WIDTH", "1px")
        .attr("height", function (d) {
            return d.height;
        })
        .attr("width", biHiSankey.nodeWidth());


    node.exit()
        .transition()
        .duration(TRANSITION_DURATION)
        .attr("transform", function (d) {
            var collapsedAncestor, endX, endY;
            collapsedAncestor = d.ancestors.filter(function (a) {
                return a.state === "collapsed";
            })[0];
            endX = collapsedAncestor ? collapsedAncestor.x : d.x;
            endY = collapsedAncestor ? collapsedAncestor.y : d.y;
            return "translate(" + endX + "," + endY + ")";
        })
        .remove();


    nodeEnter = node.enter().append("g").attr("class", "node");

    nodeEnter
        .attr("transform", function (d) {
            let startX = d._parent ? d._parent.x : d.x;
            let startY = d._parent ? d._parent.y : d.y;
            return "translate(" + startX + "," + startY + ")";
        })
        .style("opacity", 0.0005)
        .transition()
        .duration(TRANSITION_DURATION)
        .style("opacity", OPACITY.NODE_DEFAULT)
        .attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });

    nodeEnter.append("text");
    nodeEnter.append("rect")
        .style("fill", function (d) {
            d.color = colorScale(d.type.replace(/ .*/, ""));
            return d.color;
        })
        .style("stroke", function (d) {
            return d3.rgb(colorScale(d.type.replace(/ .*/, ""))).darker(0.1);
        })
        .style("stroke-WIDTH", "1px")
        .attr("height", function (d) {
            return d.height;
        })
        .attr("width", biHiSankey.nodeWidth());

    node.on("mouseenter", function (g) {
        if (!isTransitioning) {
            restoreLinksAndNodes();
            highlightConnected(g);
            fadeUnconnected(g);

            d3.select(this).select("rect")
                .style("stroke", function (d) {
                    return d3.rgb(d.color).darker(0.1);
                })
                .style("fill-opacity", OPACITY.LINK_DEFAULT);

            let outSum = g.sourceLinks.filter(link => typeof link['target']['id'] === 'string').sum('value');
            let inSum = g.targetLinks.filter(link => typeof link['source']['id'] === 'string').sum('value');

            tooltip
                .style("left", g.x + MARGIN.LEFT + "px")
                .style("top", g.y + g.height + MARGIN.TOP + 5 + "px")
                .transition()
                .duration(TRANSITION_DURATION)
                .style("opacity", 1).select(".value")
                .text(function () {
                    var additionalInstructions = g.children.length ? "\n(Double click to expand)" : "\n(Double click to colapse)";
                    return formatIcdCode(g) + g.name + "\nTotal In: " + formatFlow(inSum) + "\nTotal Out: " + formatFlow(outSum) + "\nNetFlow: " + formatFlow(g.netFlow) + additionalInstructions;
                });
        }
    });

    node.on("mouseleave", function () {
        if (!isTransitioning) {
            hideTooltip();
            restoreLinksAndNodes();
        }
    });

    /**
     * Fix to allow for dblclick on dragging element
     * This essentially checks to see if the vectors are in the same location once the drag
     * has ended.
     */

    var lastvector = []

    function isclicked(node) {
        try {
            if (lastvector[node.id].toString() !== [node.x, node.y].toString()) {
                throw 'no match';
            }
            showHideChildren(node);
        } catch (err) {
            lastvector[node.id] = [node.x, node.y]
        }
    }

    // allow nodes to be dragged to new positions
    node.call(d3.behavior.drag()
        .origin(function (d) {
            return d;
        })
        .on("dragstart", function () {
            node.event, this.parentNode.appendChild(this);
        })
        .on("dragend", isclicked)
        .on("drag", dragmove));

    // add in the text for the nodes
    node.filter(function (d) {
        return d.value !== 0;
    })
        .select("text")
        .attr("x", -6)
        .attr("y", function (d) {
            return d.height / 2;
        })
        .attr("dy", ".35em")
        .attr("text-anchor", "end")
        .attr("transform", null)
        .text(function (d) {
            return d.name;
        })
        .filter(function (d) {
            return d.x < WIDTH / 2;
        })
        .attr("x", 6 + biHiSankey.nodeWidth())
        .attr("text-anchor", "start");


    collapser = svg.select("#collapsers").selectAll(".collapser")
        .data(biHiSankey.expandedNodes(), function (d) {
            return d.id;
        });


    collapserEnter = collapser.enter().append("g").attr("class", "collapser");

    collapserEnter.append("circle")
        .attr("r", COLLAPSER.RADIUS)
        .style("fill", function (d) {
            d.color = colorScale(d.type.replace(/ .*/, ""));
            return d.color;
        });

    collapserEnter
        .style("opacity", OPACITY.NODE_DEFAULT)
        .attr("transform", function (d) {
            return "translate(" + (d.x + d.width / 2) + "," + (d.y + COLLAPSER.RADIUS) + ")";
        });

    collapserEnter.on("dblclick", showHideChildren);

    collapser.select("circle")
        .attr("r", COLLAPSER.RADIUS);

    collapser.transition()
        .delay(TRANSITION_DURATION)
        .duration(TRANSITION_DURATION)
        .attr("transform", function (d, i) {
            return "translate("
                + (COLLAPSER.RADIUS + i * 2 * (COLLAPSER.RADIUS + COLLAPSER.SPACING))
                + ","
                + (-COLLAPSER.RADIUS - OUTER_MARGIN)
                + ")";
        });

    collapser.on("mouseenter", function (g) {
        if (!isTransitioning) {
            showTooltip().select(".value")
                .text(function () {
                    return g.name + "\n(Double click to expand.)";
                });

            var highlightColor = highlightColorScale(g.type.replace(/ .*/, ""));

            d3.select(this)
                .style("opacity", OPACITY.NODE_HIGHLIGHT)
                .select("circle")
                .style("fill", highlightColor);

            node.filter(function (d) {
                return d.ancestors.indexOf(g) >= 0;
            }).style("opacity", OPACITY.NODE_HIGHLIGHT)
                .select("rect")
                .style("fill", highlightColor);
        }
    });

    collapser.on("mouseleave", function (g) {
        if (!isTransitioning) {
            hideTooltip();
            d3.select(this)
                .style("opacity", OPACITY.NODE_DEFAULT)
                .select("circle")
                .style("fill", function (d) {
                    return d.color;
                });

            node.filter(function (d) {
                return d.ancestors.indexOf(g) >= 0;
            }).style("opacity", OPACITY.NODE_DEFAULT)
                .select("rect")
                .style("fill", function (d) {
                    return d.color;
                });
        }
    });

    collapser.exit().remove();

}


function union(setA, setB) {
    var _union = new Set(setA);
    for (var elem of setB) {
        _union.add(elem);
    }
    return _union;
}

var icdNodes = (function () {
    let nodes = null;
    $.ajax({
        'async': false,
        'url': "/icdnodes",
        'dataType': "json",
        'success': function (data) {
            nodes = data;
        }
    });

    return nodes;
})();

var icdLinks = (function () {
    let params = {'patternKey': $('#patternKey').val()};
    let links = null;

    $.ajax({
        'async': false,
        'data': params,
        'url': "/icdlinks",
        'dataType': "json",
        'success': function (data) {
            links = data;
        }
    });

    return links;
})();

function getUnique(arr, comp) {
    const unique = arr
        .map(e => e[comp])
        .map((e, i, final) => final.indexOf(e) === i && i)
        .filter(e => arr[e]).map(e => arr[e]);
    return unique;
}

var icdFilteredNodes = function (links) {
    let usedNodes = union(reduce(_.clone(links), 'source'), reduce(_.clone(links), 'target'));
    let nodes = [];
    let parents = [];

    usedNodes.forEach(function (node) {
        var icdNode = _.clone(icdNodes[node]);
        var icdParent = _.clone(icdNodes[icdNode['parent']]);

        nodes.push(icdNode);
        parents.push(icdParent);
    });

    return _.union(nodes, getUnique(parents, 'id'));
};

function valueUpdate() {
    document.body.style.cursor = 'wait';

    let age = $('#ageValue').val();
    $('#agelabel').text('Age: ' + (Math.round(age / 10) * 10) + ' to ' + (10 + Math.round(age / 10) * 10));

    var gender = $("#gender option:selected").val();
    let groupKey = Math.round(age / 10) + '' + gender.charAt(0);

    if (icdNodes !== null && icdLinks !== null && icdLinks.hasOwnProperty(groupKey)) {
        let newLinks = $.extend(true, [], icdLinks[groupKey]);
        let newNodes = icdFilteredNodes(newLinks);

        let currentCollapsed = new Set(reduce(_.clone(biHiSankey.collapsedNodes()), 'id'));
        let currentExpanded = new Set(reduce(_.clone(biHiSankey.expandedNodes()), 'id'));

        console.log(currentCollapsed, currentExpanded);

        if (newLinks.length > 0 && newNodes.length > 0) {
            biHiSankey
                .nodes(newNodes)
                .links(newLinks)
                .initializeNodes(function (node) {
                    node.state = node.parent ? "contained" : "collapsed";
                })
                .layout(LAYOUT_INTERATIONS);

            disableUserInterractions(2 * TRANSITION_DURATION);
            update();
        }
    } else {
        alert("No entry found...");
    }
    document.body.style.cursor = 'default';
}

$(document).ready(function () {
    document.body.style.cursor = 'default';

    $('#gender').on('change', function () {
        valueUpdate();
    });

    $('#ageValue').on('input', function () {
        valueUpdate();
    });
    valueUpdate();
});
